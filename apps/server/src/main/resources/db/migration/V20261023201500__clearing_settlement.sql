SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 结算与打款：把"平台认为自己该给商家多少"落成可执行的批次和出款单。
--
-- 三张表各管一段：
--   settlement_item  —— 一个子单一行的待结算明细（钱在 pending 里，等确认收货）
--   settlement_batch —— 一次结算的聚合（金额从此不可变）
--   payout           —— 一笔打款指令（成功与否由渠道回执说了算，不由平台判定）
--
-- 和账本的分工：账本是真相（只追加的分录），这三张表是"业务进度"。
-- 余额永远由分录驱动，这三张表不参与算余额。
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE clearing.posting_group IS
    '分录组：一笔业务对应一组分录，组内金额合计必须为 0；biz_no 是幂等键';

-- 待结算明细。粒度和冻结一致：订单行汇总到子单，一个子单一行。
-- 不按订单行存，是因为结算、打款、佣金都按子单算；行级差异只影响退款冲销金额。
CREATE TABLE clearing.settlement_item
(
    seller_order_id   uuid PRIMARY KEY,
    merchant_id       uuid        NOT NULL,
    currency          char(3)     NOT NULL,
    goods_amount      bigint      NOT NULL,
    payable_amount    bigint      NOT NULL,
    commission_amount bigint      NOT NULL,
    net_amount        bigint      NOT NULL,
    refunded_amount   bigint      NOT NULL DEFAULT 0,
    status            text        NOT NULL DEFAULT 'pending',
    released_at       timestamptz,
    settled_at        timestamptz,
    batch_id          uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),

    -- 净额必须是算出来的，不能是调用方传的：传一个和金额对不上的净额，
    -- 结算时就会多打或少打，而且事后只能靠人眼发现
    CONSTRAINT ck_item_net CHECK (net_amount = payable_amount - commission_amount),
    CONSTRAINT ck_item_amount CHECK (goods_amount >= 0 AND commission_amount >= 0 AND refunded_amount >= 0),
    CONSTRAINT ck_item_status CHECK (status IN ('pending', 'released', 'settled')),
    -- 已结算必须挂在批次上；没结算就不该有批次
    CONSTRAINT ck_item_batch CHECK ((status = 'settled') = (batch_id IS NOT NULL))
);

COMMENT ON TABLE clearing.settlement_item IS
    '待结算明细：一个子单一行；钱在 merchant.pending 里，确认收货后才 released';
COMMENT ON COLUMN clearing.settlement_item.refunded_amount IS
    '累计已冲销金额；结算净额 = net_amount - refunded_amount，允许为负（退款超过本单）';

CREATE INDEX idx_settlement_item_due ON clearing.settlement_item (merchant_id, released_at)
    WHERE status = 'released';

CREATE TABLE clearing.settlement_batch
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    batch_no      text        NOT NULL,
    merchant_id   uuid        NOT NULL,
    currency      char(3)     NOT NULL,
    item_count    integer     NOT NULL,
    gross_amount  bigint      NOT NULL,
    refund_amount bigint      NOT NULL,
    net_amount    bigint      NOT NULL,
    status        text        NOT NULL DEFAULT 'closed',
    period_start  date        NOT NULL,
    period_end    date        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    paid_at       timestamptz,

    CONSTRAINT uq_batch_no UNIQUE (batch_no),
    CONSTRAINT ck_batch_amount CHECK (
        gross_amount >= 0 AND refund_amount >= 0 AND net_amount = gross_amount - refund_amount),
    CONSTRAINT ck_batch_status CHECK (status IN ('closed', 'paying', 'paid', 'failed')),
    CONSTRAINT ck_batch_period CHECK (period_end >= period_start)
);

COMMENT ON TABLE clearing.settlement_batch IS
    '结算批次：closed 之后金额不可变；打款失败已成功的部分不重打';

CREATE TABLE clearing.payout
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    payout_no       text        NOT NULL,
    batch_id        uuid        NOT NULL,
    merchant_id     uuid        NOT NULL,
    amount          bigint      NOT NULL,
    currency        char(3)     NOT NULL,
    channel         text        NOT NULL DEFAULT 'mock',
    status          text        NOT NULL DEFAULT 'submitted',
    channel_txn_id  text,
    failure_reason  text,
    submitted_at    timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,

    CONSTRAINT uq_payout_no UNIQUE (payout_no),
    -- 一个批次只出一笔（拆多通道是以后的事，现在拆了也没有第二个通道可用）
    CONSTRAINT uq_payout_batch UNIQUE (batch_id),
    CONSTRAINT ck_payout_amount CHECK (amount > 0),
    CONSTRAINT ck_payout_status CHECK (status IN ('submitted', 'success', 'failed'))
);

COMMENT ON TABLE clearing.payout IS
    '打款单：只是"发了一条打款指令"；success 必须来自渠道回执，不能由平台自己判定';
