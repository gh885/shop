-- V81: 订单域重构第一步 —— 主订单（trade）、行级账本列、发货单行、退款三表、支付归属
--
-- 目标模型见 docs/domain/order-model.md（2026-10-18 定案）。本迁移只做「新增形状」：
--   * 新表：orders.trades / logistics.shipment_lines / aftersale.refunds / refund_lines / refund_executions
--   * 新列：orders.orders（trade_id + 退款/补偿汇总）、orders.items（分摊 + 计数）、payment.payments（trade_id + 已退额）
--
-- 为什么这一步不删旧列、不改旧词表：破坏性改形要和消费它的代码同批走（否则应用直接不可启动，
-- 批次门禁里的 mvn test / pnpm test:server 就只剩「迁移能不能跑」一个信息）。旧列在后续批次随对应代码删除：
--   批次② 下单/支付：orders 的地址 / checkout_key / pay_expire 上移，status 去 PENDING_PAYMENT
--   批次③ 发货：shipments 状态词表对齐，行数量开始累计
--   批次④ 退款：aftersale.tickets / ticket_events 与 orders 的售后投影列退出
-- 「无兼容负担」体现在不做数据搬迁：存量行照常留旧形状，新链路只写新形状，旧形状删列时一并消失。
--
-- 金额一律整数分 + 币种列（V58 口径：币种按行存，CHECK 只认 CNY），新行都带非负闸门。

-- ============================================================================
-- 1) 主订单：一次支付的载体，1 : N 子订单
-- ============================================================================

CREATE TABLE orders.trades (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    trade_no           VARCHAR(32) NOT NULL,              -- 对外单号
    user_id            UUID NOT NULL,                     -- 买家，account.users.id，裸引用不加 FK
    status             VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT'
                       CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CLOSED')),
    closed_reason      VARCHAR(32)
                       CHECK (closed_reason IN ('BUYER_CANCELLED', 'PAY_TIMEOUT', 'FULL_REFUND', 'PLATFORM_CLOSED')),

    item_amount        BIGINT NOT NULL CHECK (item_amount >= 0),              -- Σ 子订单 item_amount
    shipping_fee       BIGINT NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),   -- Σ 子订单 shipping_fee
    discount_amount    BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),-- 兜底优惠池，分摊到全部子订单的行
    pay_amount         BIGINT NOT NULL CHECK (pay_amount >= 0),               -- 实付 = item + shipping − discount
    paid_amount        BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),    -- 已付
    refunded_amount    BIGINT NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),-- 已退（按行退款 + 运费），不含补偿
    compensated_amount BIGINT NOT NULL DEFAULT 0 CHECK (compensated_amount >= 0), -- 已付补偿，独立计数
    currency           VARCHAR(3) NOT NULL DEFAULT 'CNY',

    -- 收货快照：下单瞬间定格，之后改地址簿不影响已下单。七列合起来就是 §4.1 的 address_snapshot
    receiver_name        VARCHAR(30) NOT NULL,
    receiver_phone       VARCHAR(20) NOT NULL,
    receiver_region_code VARCHAR(12) NOT NULL,
    receiver_province    VARCHAR(30) NOT NULL,
    receiver_city        VARCHAR(30) NOT NULL,
    receiver_district    VARCHAR(30) NOT NULL,
    receiver_detail      VARCHAR(120) NOT NULL,
    buyer_message        VARCHAR(200),

    pay_expire_at      TIMESTAMPTZ NOT NULL,              -- 待支付截止，超时自动关单的扫描依据
    paid_at            TIMESTAMPTZ,
    closed_at          TIMESTAMPTZ,
    checkout_key       UUID,                              -- 结算幂等键（前端生成），(user_id, checkout_key) 唯一
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_trades_pay_amount
        CHECK (pay_amount = item_amount + shipping_fee - discount_amount),
    CONSTRAINT ck_trades_discount_amount
        CHECK (discount_amount <= item_amount + shipping_fee),
    CONSTRAINT ck_trades_paid_amount
        CHECK (paid_amount <= pay_amount),
    CONSTRAINT ck_trades_refunded_amount
        CHECK (refunded_amount <= paid_amount),
    CONSTRAINT ck_trades_currency
        CHECK (currency = 'CNY'),
    -- 状态只能由事实字段驱动（INV-24 的主订单篇）：已支付必有 paid_at 且付满，已关闭必有 closed_at + 原因
    CONSTRAINT ck_trades_paid_fields
        CHECK (status <> 'PAID' OR (paid_at IS NOT NULL AND paid_amount = pay_amount)),
    CONSTRAINT ck_trades_closed_fields
        CHECK (status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_reason IS NOT NULL))
);

CREATE UNIQUE INDEX uk_trades_trade_no ON orders.trades(trade_no);

-- 同一次结算只落一张主订单：重复提交撞这个键，回读原单
CREATE UNIQUE INDEX uk_trades_user_checkout
    ON orders.trades(user_id, checkout_key) WHERE checkout_key IS NOT NULL;

CREATE INDEX idx_trades_user_created ON orders.trades(user_id, created_at DESC);

-- 超时关单扫描只装待支付单
CREATE INDEX idx_trades_pay_expire ON orders.trades(pay_expire_at)
    WHERE status = 'PENDING_PAYMENT';

COMMENT ON TABLE orders.trades IS '主订单：一次支付的载体；1 : N 子订单，只承载支付与金额汇总，不承载履约';
COMMENT ON COLUMN orders.trades.compensated_amount IS '已付补偿，与 refunded_amount 分开计数（§6.3）';
COMMENT ON COLUMN orders.trades.checkout_key IS '结算幂等键；一次结算一张主订单，重复提交撞唯一索引回读原单';

-- ============================================================================
-- 2) 子订单：orders.orders 加主订单归属与退款汇总
-- ============================================================================

ALTER TABLE orders.orders
    ADD COLUMN IF NOT EXISTS trade_id UUID,
    ADD COLUMN IF NOT EXISTS refunded_amount BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS compensated_amount BIGINT NOT NULL DEFAULT 0;

-- 一个卖家在同一张主订单下只出现一次
CREATE UNIQUE INDEX IF NOT EXISTS uk_orders_trade_shop
    ON orders.orders(trade_id, shop_id) WHERE trade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_trade ON orders.orders(trade_id);

ALTER TABLE orders.orders
    ADD CONSTRAINT ck_orders_refunded_amount
        CHECK (refunded_amount >= 0 AND refunded_amount <= pay_amount),
    ADD CONSTRAINT ck_orders_compensated_amount
        CHECK (compensated_amount >= 0);

COMMENT ON COLUMN orders.orders.trade_id IS '所属主订单 orders.trades.id；空值只存在于重构前的存量行';
COMMENT ON COLUMN orders.orders.refunded_amount IS '已退 = 按行退款 + 运费退款，不含补偿（§4.2）';
COMMENT ON COLUMN orders.orders.compensated_amount IS '已付补偿，与 refunded_amount 分开计数（§6.3）';

-- ============================================================================
-- 3) 订单行：分摊三列 + 数量/金额汇总列，账本从「纯快照」变成「快照 + 只增的汇总」
-- ============================================================================

ALTER TABLE orders.items
    ADD COLUMN IF NOT EXISTS discount_allocated  BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipping_allocated  BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS goods_paid_amount   BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refundable_amount   BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipped_quantity    INT    NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refunded_quantity   INT    NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS settled_quantity    INT    NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refunded_amount     BIGINT NOT NULL DEFAULT 0;

-- §7 里能独立成立的约束全部进库。goods_paid_amount / refundable_amount 两条等式依赖分摊算法写入，
-- 等批次②的 DiscountAllocator 落地后随写入路径一起加（否则过渡期的旧插入会撞 0 = amount 的等式）。
ALTER TABLE orders.items
    ADD CONSTRAINT ck_order_items_discount_allocated
        CHECK (discount_allocated >= 0 AND discount_allocated <= amount),
    ADD CONSTRAINT ck_order_items_shipping_allocated
        CHECK (shipping_allocated >= 0),
    ADD CONSTRAINT ck_order_items_goods_paid_amount
        CHECK (goods_paid_amount >= 0),
    ADD CONSTRAINT ck_order_items_refundable_amount
        CHECK (refundable_amount >= 0),
    ADD CONSTRAINT ck_order_items_shipped_quantity
        CHECK (shipped_quantity BETWEEN 0 AND quantity),
    ADD CONSTRAINT ck_order_items_refunded_quantity
        CHECK (refunded_quantity BETWEEN 0 AND quantity),
    -- INV-11：结清量的两个分量互不重叠，等式与上限同一条约束
    ADD CONSTRAINT ck_order_items_settled_quantity
        CHECK (settled_quantity BETWEEN 0 AND quantity AND settled_quantity = shipped_quantity + refunded_quantity),
    ADD CONSTRAINT ck_order_items_refunded_amount
        CHECK (refunded_amount >= 0 AND refunded_amount <= goods_paid_amount);

COMMENT ON COLUMN orders.items.shipped_quantity IS '当前有效发货量 = 累计发出量 − 已成功的退货退款量；仅退款与补偿不动它（§4.3）';
COMMENT ON COLUMN orders.items.refunded_quantity IS '累计已退数量（只统计成功终态的 item 型退款行）';
COMMENT ON COLUMN orders.items.settled_quantity IS '义务结清量 = shipped_quantity + refunded_quantity，履约判定的唯一输入（INV-11）';
COMMENT ON COLUMN orders.items.refundable_amount IS '行实付 = goods_paid_amount + shipping_allocated（§4.3）';

-- ============================================================================
-- 4) 发货单行：发货粒度从订单级下到「订单行 + 数量」
-- ============================================================================

CREATE TABLE logistics.shipment_lines (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    shipment_id   UUID NOT NULL,                 -- logistics.shipments.id
    order_item_id UUID NOT NULL,                 -- orders.items.id
    quantity      INT NOT NULL CHECK (quantity > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同一张发货单里一行只能出现一次（同一行拆两行没有语义）
CREATE UNIQUE INDEX uk_shipment_lines_shipment_item
    ON logistics.shipment_lines(shipment_id, order_item_id);

-- 发货守卫与「已签发量」统计按行反查；取消/退货扣回也走它
CREATE INDEX idx_shipment_lines_item ON logistics.shipment_lines(order_item_id);

COMMENT ON TABLE logistics.shipment_lines IS '发货单行：订单行 + 本次发货数量；有效发货量只认已发出且未取消的发货单（§4.4）';

-- ============================================================================
-- 5) 退款单 / 退款单行 / 退款执行记录
-- ============================================================================

CREATE TABLE aftersale.refunds (
    id                    UUID PRIMARY KEY DEFAULT uuidv7(),
    trade_id              UUID NOT NULL,                  -- orders.trades.id，支付归属
    order_id              UUID NOT NULL,                  -- orders.orders.id，业务归属（两者都存）
    user_id               UUID NOT NULL,                  -- 买家，account.users.id
    shop_id               UUID NOT NULL,                  -- 卖家店铺（处理方）
    refund_no             VARCHAR(32) NOT NULL,           -- 对外单号
    type                  VARCHAR(20) NOT NULL
                          CHECK (type IN ('REFUND_ONLY', 'RETURN_REFUND', 'COMPENSATION')),
    amount                BIGINT NOT NULL CHECK (amount >= 0),   -- 本次退款总额
    currency              VARCHAR(3) NOT NULL DEFAULT 'CNY',
    status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'AGREED', 'RETURN_PENDING', 'RETURNED', 'RECEIVED',
                                            'REFUNDING', 'REFUNDED', 'REJECTED', 'CANCELLED', 'FAILED')),
    reason                VARCHAR(200),                   -- 退款原因（自由文本；判定依据另表/另列以产品口径为准）
    return_carrier_code   VARCHAR(32),                    -- 退货物流公司 code
    return_carrier_name   VARCHAR(50),                    -- 退货物流公司展示名快照
    return_tracking_no    VARCHAR(64),                    -- 退货运单号
    succeeded_at          TIMESTAMPTZ,                    -- 退款成功时刻
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_refunds_currency CHECK (currency = 'CNY'),
    -- 只有退货退款能带退货物流；非退货类型的三列必须全空
    CONSTRAINT ck_refunds_return_logistics_fields
        CHECK (type = 'RETURN_REFUND'
               OR (return_carrier_code IS NULL AND return_carrier_name IS NULL AND return_tracking_no IS NULL)),
    -- 已寄回之后的态必须有可追溯的退货运单
    CONSTRAINT ck_refunds_returned_has_tracking
        CHECK (status NOT IN ('RETURNED', 'RECEIVED')
               OR (type = 'RETURN_REFUND' AND return_carrier_code IS NOT NULL AND return_tracking_no IS NOT NULL)),
    CONSTRAINT ck_refunds_succeeded_at
        CHECK (status <> 'REFUNDED' OR succeeded_at IS NOT NULL)
);

CREATE UNIQUE INDEX uk_refunds_refund_no ON aftersale.refunds(refund_no);
CREATE INDEX idx_refunds_order_created ON aftersale.refunds(order_id, created_at DESC);
CREATE INDEX idx_refunds_shop_status ON aftersale.refunds(shop_id, status);
CREATE INDEX idx_refunds_trade ON aftersale.refunds(trade_id);
CREATE INDEX idx_refunds_user_created ON aftersale.refunds(user_id, created_at DESC);

COMMENT ON TABLE aftersale.refunds IS '退款单：一次退款；1 : N 退款单行。未完结闸门（同一订单行至多一张）靠事务内锁订单行 + 校验插入，见 §8';
COMMENT ON COLUMN aftersale.refunds.type IS '按货的去向划分：仅退款 / 退货退款 / 补偿';
COMMENT ON COLUMN aftersale.refunds.amount IS '本次退款总额 = Σ 退款单行金额；子订单全退时含一条 shipping 行';

CREATE TABLE aftersale.refund_lines (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    refund_id     UUID NOT NULL,                 -- aftersale.refunds.id
    order_item_id UUID,                          -- item 型必填；shipping / compensation 型为空
    line_type     VARCHAR(20) NOT NULL
                  CHECK (line_type IN ('ITEM', 'SHIPPING', 'COMPENSATION')),
    quantity      INT,                           -- item 型必填；其余为空
    amount        BIGINT NOT NULL CHECK (amount >= 0),
    currency      VARCHAR(3) NOT NULL DEFAULT 'CNY',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_refund_lines_currency CHECK (currency = 'CNY'),
    -- 字段与类型强绑定：item 行必须指向订单行且带数量；运费/补偿行两者皆空
    CONSTRAINT ck_refund_lines_item_fields
        CHECK ((line_type = 'ITEM' AND order_item_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0)
               OR (line_type IN ('SHIPPING', 'COMPENSATION') AND order_item_id IS NULL AND quantity IS NULL))
);

-- 一张退款单里同一订单行只落一行（数量与金额各记一次）
CREATE UNIQUE INDEX uk_refund_lines_refund_item
    ON aftersale.refund_lines(refund_id, order_item_id) WHERE order_item_id IS NOT NULL;

CREATE INDEX idx_refund_lines_item ON aftersale.refund_lines(order_item_id, line_type);
CREATE INDEX idx_refund_lines_refund ON aftersale.refund_lines(refund_id);

COMMENT ON TABLE aftersale.refund_lines IS '退款单行：item 型挂订单行 + 数量 + 金额；shipping 型整笔退运费；compensation 型只退钱不占可退量（§4.5）';

CREATE TABLE aftersale.refund_executions (
    id                UUID PRIMARY KEY DEFAULT uuidv7(),
    refund_id         UUID NOT NULL,              -- aftersale.refunds.id
    amount            BIGINT NOT NULL CHECK (amount >= 0),
    currency          VARCHAR(3) NOT NULL DEFAULT 'CNY',
    success           BOOLEAN NOT NULL,
    request_payload   TEXT,                       -- 向渠道发出的请求
    response_payload  TEXT,                       -- 渠道原文响应
    gateway_refund_no VARCHAR(64),                -- 渠道侧退款单号，成功或受理时回填
    error_message     VARCHAR(500),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_refund_executions_currency CHECK (currency = 'CNY')
);

CREATE INDEX idx_refund_executions_refund ON aftersale.refund_executions(refund_id, created_at);

COMMENT ON TABLE aftersale.refund_executions IS '退款执行记录：每次向支付渠道发起的调用一条；重试只追加记录，不改进款单状态（§4.5）';

-- ============================================================================
-- 6) 支付流水：归属主订单 + 按退款单累计已退额
-- ============================================================================

ALTER TABLE payment.payments
    ADD COLUMN IF NOT EXISTS trade_id UUID,
    ADD COLUMN IF NOT EXISTS refunded_amount BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payments_trade
    ON payment.payments(trade_id) WHERE trade_id IS NOT NULL;

ALTER TABLE payment.payments
    ADD CONSTRAINT ck_payments_refunded_amount
        CHECK (refunded_amount >= 0 AND refunded_amount <= amount);

COMMENT ON COLUMN payment.payments.trade_id IS '所属主订单 orders.trades.id；空值只存在于重构前的存量行';
COMMENT ON COLUMN payment.payments.refunded_amount IS '该笔支付已退金额，按退款单多次累计（不按整单一次性置 REFUNDED）';
