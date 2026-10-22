SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 支付：支付单 / 退款单。
--
-- 形状与不变量见 docs/domain/ledger.md。三条边界在这里落地：
--   1. 支付单入口在 payment；trade 只认 PaymentSucceeded 这一事实，不自己发现钱到了
--   2. 渠道流水号唯一，重放靠它挡住
--   3. 金额不符不改订单、不忽略回调，整组进 suspense（suspense 在 clearing，这里只标记）
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS payment;

COMMENT ON SCHEMA payment IS '支付：只认「钱到账」这一事实，不做分账计算';

CREATE TABLE payment.payment_order
(
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    pay_no           text        NOT NULL,
    buyer_id         uuid        NOT NULL,
    order_group_id   uuid        NOT NULL,
    channel          text        NOT NULL,
    -- 发给渠道的商户订单号。回跳只带它，别的参数一律不可信
    out_trade_no     text        NOT NULL,
    amount           bigint      NOT NULL,
    expected_amount  bigint      NOT NULL,
    currency         char(3)     NOT NULL DEFAULT 'CNY',
    status           text        NOT NULL DEFAULT 'pending',
    -- 金额对不对：由我们在回调时算一次，别让 trade 和 clearing 各算一次
    matched          boolean,
    channel_txn_id   text,
    channel_payload  jsonb,
    paid_at          timestamptz,
    closed_at        timestamptz,
    expire_at        timestamptz NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_payment_pay_no UNIQUE (pay_no),
    CONSTRAINT uq_payment_out_trade_no UNIQUE (out_trade_no),
    -- 渠道流水号唯一：重放的回调撞这里，不重复记账
    CONSTRAINT uq_payment_channel_txn UNIQUE (channel_txn_id),
    CONSTRAINT ck_payment_amount CHECK (amount >= 0 AND expected_amount >= 0),
    CONSTRAINT ck_payment_status CHECK (status IN ('pending', 'success', 'failed', 'closed', 'refunded')),
    CONSTRAINT ck_payment_channel CHECK (channel IN ('alipay', 'wechat', 'mock'))
);

COMMENT ON TABLE payment.payment_order IS '支付单；一个订单组可以有多张（重试），只有一张成功';
COMMENT ON COLUMN payment.payment_order.out_trade_no IS '发给渠道的商户订单号；回跳只带它，trade_status / total_amount 一律不可信';
COMMENT ON COLUMN payment.payment_order.matched IS '回调金额与订单应付是否一致；false 时 clearing 整组进 suspense，trade 拒收';
COMMENT ON COLUMN payment.payment_order.channel_payload IS '渠道原始回调报文，只查不改，出问题时唯一能还原的东西';

CREATE INDEX idx_payment_order_group ON payment.payment_order (order_group_id);
CREATE INDEX idx_payment_order_buyer ON payment.payment_order (buyer_id, created_at DESC);

-- 超时关单只扫这个部分索引
CREATE INDEX idx_payment_pending_expire
    ON payment.payment_order (expire_at)
    WHERE status = 'pending';

CREATE TABLE payment.refund_order
(
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    refund_no        text        NOT NULL,
    payment_id       uuid        NOT NULL,
    order_group_id   uuid        NOT NULL,
    seller_order_id  uuid,
    amount           bigint      NOT NULL,
    currency         char(3)     NOT NULL DEFAULT 'CNY',
    reason           text        NOT NULL,
    status           text        NOT NULL DEFAULT 'pending',
    channel_refund_id text,
    completed_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_refund_no UNIQUE (refund_no),
    CONSTRAINT ck_refund_amount CHECK (amount > 0),
    CONSTRAINT ck_refund_status CHECK (status IN ('pending', 'success', 'failed')),

    -- 同一张支付单的同一个业务退款只能退一次。key 里带 seller_order_id 是因为
    -- 部分退款按子单退，同一订单组下每个子单各退一笔，不带它第二笔就撞了
    CONSTRAINT uq_refund_biz UNIQUE (payment_id, seller_order_id, reason)
);

COMMENT ON TABLE payment.refund_order IS '退款单；一笔业务退款一行，幂等键是 (payment_id, seller_order_id, reason)';
COMMENT ON COLUMN payment.refund_order.seller_order_id IS '部分退款按子单退；带上它才能和 RefundRequested 对齐';

CREATE INDEX idx_refund_order_group ON payment.refund_order (order_group_id);
CREATE INDEX idx_refund_payment ON payment.refund_order (payment_id);
