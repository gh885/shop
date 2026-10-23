SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 售后：一套骨架 + 一个「要不要把货寄回来」的开关。
--
-- 仅退款 / 退货退款 / 换货 共用一张表、一套状态机，类型只决定中间有没有货物往返。
-- 每个非终态都带 deadline_at / deadline_actor / deadline_action 三列，
-- 「商家超时不处理自动同意」不是硬编码，是这条机制的其中一个取值。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS returns;

COMMENT ON SCHEMA returns IS '售后：只回答这笔钱该不该退、退多少、谁出；钱不经过这里';

CREATE TABLE returns.after_sale_case
(
    id                     uuid PRIMARY KEY DEFAULT uuidv7(),
    case_no                text        NOT NULL,
    seller_order_id        uuid        NOT NULL,
    merchant_id            uuid        NOT NULL,
    buyer_id               uuid        NOT NULL,
    type                   text        NOT NULL,
    status                 text        NOT NULL,
    reason_code            text        NOT NULL,
    responsibility         text        NOT NULL DEFAULT 'undetermined',
    refund_amount          bigint      NOT NULL DEFAULT 0,
    shipping_refund_amount bigint      NOT NULL DEFAULT 0,
    currency               char(3)     NOT NULL DEFAULT 'CNY',
    deadline_at            timestamptz,
    deadline_actor         text,
    deadline_action        text,
    approved_at            timestamptz,
    completed_at           timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_case_no UNIQUE (case_no),
    CONSTRAINT ck_case_type CHECK (type IN ('refund_only', 'return_refund', 'exchange')),
    CONSTRAINT ck_case_status CHECK (status IN (
        'applied', 'approved', 'rejected', 'cancelled', 'shipping_back',
        'received', 'refunding', 'reshipping', 'completed', 'disputed')),
    CONSTRAINT ck_case_responsibility CHECK (
        responsibility IN ('merchant', 'buyer', 'platform', 'undetermined')),
    CONSTRAINT ck_case_amount CHECK (refund_amount >= 0 AND shipping_refund_amount >= 0),
    -- 三列要么都有、要么都没有：只有一半的 deadline 是没人能执行的死数据
    CONSTRAINT ck_case_deadline CHECK (
        (deadline_at IS NULL AND deadline_actor IS NULL AND deadline_action IS NULL)
            OR (deadline_at IS NOT NULL AND deadline_actor IS NOT NULL AND deadline_action IS NOT NULL))
);

COMMENT ON TABLE returns.after_sale_case IS
    '售后单；状态机一套，type 只决定中间有没有货物往返';
COMMENT ON COLUMN returns.after_sale_case.shipping_refund_amount IS
    '只表示原订单运费的退款，不表示买家寄回的运费——那笔钱平台不代收代付';
COMMENT ON COLUMN returns.after_sale_case.deadline_action IS
    '到期自动做什么：auto_approve / auto_close / auto_refund / auto_ship；扫描器只执行不判断';

CREATE INDEX idx_case_order ON returns.after_sale_case (seller_order_id);
CREATE INDEX idx_case_buyer ON returns.after_sale_case (buyer_id, created_at DESC);

-- 超时扫描只扫非终态：终态行不该出现在任何一次扫描里
CREATE INDEX idx_case_deadline ON returns.after_sale_case (deadline_at)
    WHERE status NOT IN ('completed', 'cancelled', 'rejected');

-- 「一个订单行同一时间只能有一个未终态 case」跨两张表，写不成部分唯一索引
-- （PG 的索引谓词不许带子查询）。所以由 service 在事务里先取
-- pg_advisory_xact_lock(hashtext(order_line_id)) 再查再插——见 AfterSaleService.apply。

CREATE TABLE returns.case_item
(
    case_id       uuid    NOT NULL,
    order_line_id uuid    NOT NULL,
    quantity      integer NOT NULL,
    refund_amount bigint  NOT NULL,

    CONSTRAINT pk_case_item PRIMARY KEY (case_id, order_line_id),
    CONSTRAINT ck_case_item_qty CHECK (quantity > 0),
    CONSTRAINT ck_case_item_amount CHECK (refund_amount >= 0)
);

COMMENT ON TABLE returns.case_item IS '一个 case 可以退多行；判责和金额在行上算，主表存汇总';

CREATE TABLE returns.return_shipment
(
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    case_id      uuid        NOT NULL,
    carrier_code text        NOT NULL,
    tracking_no  text        NOT NULL,
    status       text        NOT NULL DEFAULT 'created',
    shipped_at   timestamptz,
    received_at  timestamptz,

    -- 一个 case 只有一条退货物流：补寄第二次要走新 case，否则责任和金额都算不清
    CONSTRAINT uq_return_shipment_case UNIQUE (case_id),
    CONSTRAINT ck_return_shipment_status CHECK (status IN ('created', 'in_transit', 'received', 'lost'))
);

COMMENT ON TABLE returns.return_shipment IS '只记买家寄回那一段；换货重发的新包裹走 fulfillment';

CREATE TABLE returns.case_evidence
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    case_id       uuid        NOT NULL,
    uploader_type text        NOT NULL,
    uploader_id   uuid        NOT NULL,
    media_url     text        NOT NULL,
    description   text,
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_case_evidence_uploader CHECK (uploader_type IN ('buyer', 'merchant', 'platform'))
);

COMMENT ON TABLE returns.case_evidence IS '举证是判责的依据；没有它，判责就是客服凭印象说了算';

CREATE TABLE returns.case_log
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    case_id     uuid        NOT NULL,
    from_status text,
    to_status   text        NOT NULL,
    actor_type  text        NOT NULL,
    actor_id    uuid,
    reason      text,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_case_log_actor CHECK (actor_type IN ('buyer', 'merchant', 'platform', 'system'))
);

COMMENT ON TABLE returns.case_log IS '每次状态变化一行，改判责也记一行；没有它「这单为什么给退了」只能靠猜';

CREATE INDEX idx_case_log ON returns.case_log (case_id, created_at);

CREATE TRIGGER trg_case_log_append_only
    BEFORE UPDATE OR DELETE
    ON returns.case_log
    FOR EACH ROW
EXECUTE FUNCTION common.reject_mutation();
