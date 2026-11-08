SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 站内信：事件驱动的通知落库。
--
-- 只存 type + params + link，不存标题正文——文案归前端 i18n 模板（自建模板是产品能力，
-- 渠道外采）。收件人建模成 buyer_id / merchant_id 两列（恰好一个非空）：归属列按名进 SQL
-- 是 DataScopeTest 的判据，多态 recipient_id 会把这条防线架空。
-- 通知行是产品数据不是事件留痕，不随 event_publication 清理，也不挂审计（读自己/标记已读）。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS notification;

COMMENT ON SCHEMA notification IS '站内信：核心域事件的收件人投递；无域数据，可按保留期清空重建';

CREATE TABLE notification.message
(
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    recipient_type text        NOT NULL,
    buyer_id       uuid,
    merchant_id    uuid,
    type           text        NOT NULL,
    params         jsonb       NOT NULL DEFAULT '{}',
    link           text,
    read_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    -- 恰好一个收件人：买家消息绑 buyer_id，商家消息绑 merchant_id，第三种收件人不存在
    CONSTRAINT ck_message_recipient CHECK (
        (recipient_type = 'buyer' AND buyer_id IS NOT NULL AND merchant_id IS NULL)
        OR (recipient_type = 'merchant' AND merchant_id IS NOT NULL AND buyer_id IS NULL)),
    CONSTRAINT ck_message_type CHECK (type IN (
        'order_placed', 'shipment_recorded', 'refund_succeeded',
        'order_completed', 'seller_suspended', 'seller_resumed')),
    CONSTRAINT ck_message_params CHECK (jsonb_typeof(params) = 'object')
);

COMMENT ON TABLE notification.message IS '站内信：type + params 由前端 i18n 模板渲染，link 是买家端深链路径';
COMMENT ON COLUMN notification.message.recipient_type IS 'buyer 买家 / merchant 商家；与两个归属列的恰一非空约束联动';
COMMENT ON COLUMN notification.message.type IS '消息种类，枚举见 NotificationType；前端按它选模板';
COMMENT ON COLUMN notification.message.params IS '模板插值参数（jsonb object），如 {trackingNo}、{amount, currency}';
COMMENT ON COLUMN notification.message.link IS '买家端深链路径（如 /orders/{id}）；商家侧暂无界面，存 NULL';
COMMENT ON COLUMN notification.message.read_at IS '已读时刻；NULL = 未读。CAS 置值，幂等';

-- 买家通知列表（私有读，SQL 恒带 buyer_id）
CREATE INDEX idx_message_buyer ON notification.message (buyer_id, created_at DESC) WHERE buyer_id IS NOT NULL;
-- 未读计数走部分索引，已读行不进扫描
CREATE INDEX idx_message_buyer_unread ON notification.message (buyer_id, created_at DESC)
    WHERE buyer_id IS NOT NULL AND read_at IS NULL;
-- 商家通知列表与未读计数
CREATE INDEX idx_message_merchant ON notification.message (merchant_id, created_at DESC) WHERE merchant_id IS NOT NULL;
CREATE INDEX idx_message_merchant_unread ON notification.message (merchant_id, created_at DESC)
    WHERE merchant_id IS NOT NULL AND read_at IS NULL;
