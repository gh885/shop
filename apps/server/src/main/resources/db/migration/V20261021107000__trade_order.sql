SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 订单三层：order_group（支付 + 关闭）/ seller_order（履约 + 结算）/ order_line（快照 + 计数器）。
--
-- 形状与不变式见 docs/domain/order-model.md。四条硬约束在这里落地：
--   1. 订单组只有支付维度和关闭维度，不许出现履约状态
--   2. 关闭是独立的一列，不是 payment_status 的一个值
--   3. 报价单唯一索引保证一张报价只能用一次
--   4. 行金额恒等式由 CHECK 钉死；跨表的靠核对任务，别假装防住了
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS trade;

COMMENT ON SCHEMA trade IS '交易：订单组 / 商家子单 / 订单行；支付在 group，履约与结算在 seller_order';

CREATE TABLE trade.order_group
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    group_no        text        NOT NULL,
    buyer_id        uuid        NOT NULL,
    quote_id        uuid        NOT NULL,
    payment_status  text        NOT NULL DEFAULT 'unpaid',
    closed_at       timestamptz,
    close_reason    text,
    currency        char(3)     NOT NULL DEFAULT 'CNY',
    goods_amount    bigint      NOT NULL,
    discount_amount bigint      NOT NULL,
    shipping_amount bigint      NOT NULL,
    payable_amount  bigint      NOT NULL,
    paid_amount     bigint      NOT NULL DEFAULT 0,
    refunded_amount bigint      NOT NULL DEFAULT 0,
    ship_address    jsonb       NOT NULL,
    expire_at       timestamptz NOT NULL,
    paid_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_order_group_no UNIQUE (group_no),
    -- 幂等锚点：同一张报价单下两单，第二单必失败
    CONSTRAINT uq_order_group_quote UNIQUE (quote_id),
    CONSTRAINT ck_group_amount CHECK (payable_amount = goods_amount - discount_amount + shipping_amount),
    CONSTRAINT ck_group_status CHECK (payment_status IN ('unpaid', 'paid', 'partially_refunded', 'refunded')),
    -- 关闭与原因必须同生同死；NULL 在 CHECK 里不会自动放行，所以显式写全
    CONSTRAINT ck_group_close CHECK (
        (closed_at IS NULL AND close_reason IS NULL)
            OR (closed_at IS NOT NULL
                AND close_reason IN ('buyer_cancelled', 'timeout', 'platform_forced', 'refunded',
                                     'merchant_out_of_stock'))),
    CONSTRAINT ck_group_paid CHECK (
        paid_amount >= 0 AND paid_amount <= payable_amount
            AND refunded_amount >= 0 AND refunded_amount <= paid_amount),
    CONSTRAINT ck_group_nonneg CHECK (
        goods_amount >= 0 AND discount_amount >= 0 AND shipping_amount >= 0 AND payable_amount >= 0),
    -- 已付款订单的关闭只能走退款或平台强制，不许直接写 closed_at 就完事
    CONSTRAINT ck_group_paid_close CHECK (
        closed_at IS NULL
            OR payment_status = 'unpaid'
            OR close_reason IN ('refunded', 'platform_forced'))
);

COMMENT ON TABLE trade.order_group IS '一次结算 = 支付单位；只有支付和关闭两个维度，没有履约状态';
COMMENT ON COLUMN trade.order_group.closed_at IS '关闭是独立维度：未付款取消不用退钱，已付款关闭要记冲正';
COMMENT ON COLUMN trade.order_group.payment_status IS 'closed_at 非空时仍保留自己的值，用来回答"这单到底收过钱没有"';

CREATE INDEX idx_order_group_buyer ON trade.order_group (buyer_id, created_at DESC);

-- 超时任务只扫这个部分索引，不扫全表
CREATE INDEX idx_order_group_unpaid_expire
    ON trade.order_group (expire_at)
    WHERE payment_status = 'unpaid' AND closed_at IS NULL;

CREATE TABLE trade.seller_order
(
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    order_no           text        NOT NULL,
    group_id           uuid        NOT NULL,
    merchant_id        uuid        NOT NULL,
    shop_id            uuid        NOT NULL,
    currency           char(3)     NOT NULL DEFAULT 'CNY',
    goods_amount       bigint      NOT NULL,
    discount_amount    bigint      NOT NULL,
    shipping_amount    bigint      NOT NULL,
    payable_amount     bigint      NOT NULL,
    fulfillment_status text        NOT NULL DEFAULT 'unshipped',
    closed_reason      text,
    closed_at          timestamptz,
    ship_address       jsonb       NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_seller_order_no UNIQUE (order_no),
    CONSTRAINT ck_seller_amount CHECK (payable_amount = goods_amount - discount_amount + shipping_amount),
    CONSTRAINT ck_seller_status CHECK (fulfillment_status IN
        ('unshipped', 'partial_shipped', 'shipped', 'received')),
    -- 子单的关闭与原因也必须同生同死
    CONSTRAINT ck_seller_close CHECK (
        (closed_at IS NULL AND closed_reason IS NULL)
            OR (closed_at IS NOT NULL
                AND closed_reason IN ('buyer_cancelled', 'timeout', 'refunded', 'merchant_out_of_stock')))
);

COMMENT ON TABLE trade.seller_order IS '按商家拆 = 结算 + 发货 + 售后判责单位；不存 shipped_qty，那两个数从行聚合';
COMMENT ON COLUMN trade.seller_order.ship_address IS 'group 上那份是下单快照只读，这份是当前生效地址，发货读它';

CREATE INDEX idx_seller_order_merchant ON trade.seller_order (merchant_id, created_at DESC);
CREATE INDEX idx_seller_order_group ON trade.seller_order (group_id);

CREATE TABLE trade.order_line
(
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    seller_order_id    uuid        NOT NULL,
    line_no            integer     NOT NULL,
    offer_id           uuid        NOT NULL,
    sku_id             uuid        NOT NULL,
    spu_id             uuid        NOT NULL,
    currency           char(3)     NOT NULL DEFAULT 'CNY',
    quantity           integer     NOT NULL,
    unit_amount        bigint      NOT NULL,
    subtotal           bigint      NOT NULL,
    discount_amount    bigint      NOT NULL,
    payable            bigint      NOT NULL,

    -- 计数器：可改
    shipped_qty        integer     NOT NULL DEFAULT 0,
    received_qty       integer     NOT NULL DEFAULT 0,
    refunded_qty       integer     NOT NULL DEFAULT 0,
    refunded_amount    bigint      NOT NULL DEFAULT 0,
    cancelled_qty      integer     NOT NULL DEFAULT 0,
    cancelled_subtotal bigint      NOT NULL DEFAULT 0,
    cancelled_discount bigint      NOT NULL DEFAULT 0,
    cancelled_amount   bigint      NOT NULL DEFAULT 0,

    -- 以下全是快照列，写入后永不更新
    title              text        NOT NULL,
    image_url          text,
    spec_values        jsonb       NOT NULL DEFAULT '{}',
    category_id        uuid        NOT NULL,
    brand_id           uuid,
    identity_key       text,
    commission_rate_bp integer     NOT NULL DEFAULT 0,
    rate_version       text        NOT NULL DEFAULT 'v1',

    CONSTRAINT uq_order_line UNIQUE (seller_order_id, line_no),
    CONSTRAINT ck_line_qty CHECK (quantity > 0),
    CONSTRAINT ck_line_sub CHECK (subtotal = unit_amount * quantity),
    CONSTRAINT ck_line_pay CHECK (payable = subtotal - discount_amount AND payable >= 0),
    CONSTRAINT ck_line_disc CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
    CONSTRAINT ck_line_cancel CHECK (
        cancelled_subtotal = unit_amount * cancelled_qty
            AND cancelled_discount >= 0 AND cancelled_discount <= cancelled_subtotal
            AND cancelled_discount <= discount_amount
            AND cancelled_amount = cancelled_subtotal - cancelled_discount
            AND cancelled_amount <= payable),
    CONSTRAINT ck_line_refund CHECK (
        refunded_amount >= 0 AND refunded_amount <= payable
            AND cancelled_amount + refunded_amount <= payable),
    CONSTRAINT ck_line_cnt CHECK (
        shipped_qty >= 0 AND received_qty >= 0 AND refunded_qty >= 0 AND cancelled_qty >= 0
            AND shipped_qty <= quantity
            AND received_qty <= shipped_qty
            AND refunded_qty + cancelled_qty <= quantity)
);

COMMENT ON TABLE trade.order_line IS '行快照 + 计数器；快照列只插不改，行永不删除。line_no 沿用报价单行号，不重新编号';
COMMENT ON COLUMN trade.order_line.payable IS '行实付不含运费：payable = subtotal - discount_amount';

CREATE INDEX idx_order_line_seller_order ON trade.order_line (seller_order_id);
CREATE INDEX idx_order_line_sku ON trade.order_line (sku_id);

CREATE TABLE trade.order_line_discount
(
    order_line_id uuid    NOT NULL,
    rule_id       uuid    NOT NULL,
    rule_version  text    NOT NULL,
    type          text    NOT NULL,
    bearer        text    NOT NULL,
    currency      char(3) NOT NULL DEFAULT 'CNY',
    amount        bigint  NOT NULL,

    CONSTRAINT pk_order_line_discount PRIMARY KEY (order_line_id, rule_id),
    CONSTRAINT ck_line_discount_amount CHECK (amount > 0),
    CONSTRAINT ck_line_discount_bearer CHECK (bearer IN ('platform', 'merchant'))
);

COMMENT ON TABLE trade.order_line_discount IS '从报价单分摊矩阵原样拷过来，连 rule_version 一起钉住；退款按它退，结算按 bearer 分科目';

CREATE TABLE trade.order_event
(
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    event_key  text        NOT NULL,
    order_kind text        NOT NULL,
    order_id   uuid        NOT NULL,
    dimension  text        NOT NULL,
    from_value text,
    to_value   text        NOT NULL,
    actor_type text        NOT NULL,
    actor_id   uuid,
    reason     text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_order_event UNIQUE (event_key),
    CONSTRAINT ck_order_event_kind CHECK (order_kind IN ('group', 'seller_order', 'line')),
    CONSTRAINT ck_order_event_dimension CHECK (dimension IN
        ('payment', 'fulfillment', 'close', 'aftersale', 'address')),
    CONSTRAINT ck_order_event_actor CHECK (actor_type IN
        ('buyer', 'merchant', 'system', 'platform', 'channel'))
);

COMMENT ON TABLE trade.order_event IS '每次状态变更一行；没有它，"这单为什么被关了"只能靠猜';

CREATE INDEX idx_order_event_order ON trade.order_event (order_kind, order_id, created_at);

CREATE TRIGGER trg_order_event_append_only
    BEFORE UPDATE OR DELETE
    ON trade.order_event
    FOR EACH ROW
EXECUTE FUNCTION common.reject_mutation();
