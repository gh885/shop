-- V18: Payment 模块 — payments 支付流水表
-- 归属：交易资金流水。V1 MOCK 渠道即时成功；接真实网关后扩展 PENDING/FAILED 状态与回调字段，
-- 收银台/回调逻辑全部落在本模块，order 只经事件感知支付结果。
-- 幂等：一单一成功流水的部分唯一索引是重复支付的 DB 硬兜底（连点/并发重试）。

CREATE SCHEMA IF NOT EXISTS payment;

CREATE TABLE IF NOT EXISTS payment.payments (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id   UUID NOT NULL,               -- orders.orders.id，跨 schema 裸引用不加 FK
    order_no   VARCHAR(32) NOT NULL,        -- 冗余单号：对账时人可读，免回查订单表
    user_id    UUID NOT NULL,               -- 支付发起人，auth.users.id，裸引用不加 FK
    amount     BIGINT NOT NULL CHECK (amount >= 0),  -- 支付金额，分（= 订单 pay_amount）
    currency   VARCHAR(3) NOT NULL DEFAULT 'CNY',
    channel    VARCHAR(20) NOT NULL DEFAULT 'MOCK',   -- V1 模拟渠道；接网关后 MOCK/WECHAT/ALIPAY
    status     VARCHAR(20) NOT NULL DEFAULT 'SUCCESS', -- V1 即时成功；网关化后扩展 PENDING/FAILED/REFUNDED
    paid_at    TIMESTAMPTZ,                 -- 支付成功时刻；网关化后 PENDING 流水此列为 NULL
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- 流水只插不改：失败/退款语义由将来的状态机 + 新行表达，故无 updated_at
);

-- 一笔订单至多一条成功流水：幂等支付的 DB 兜底（部分唯一索引）
CREATE UNIQUE INDEX IF NOT EXISTS uk_payments_order_success ON payment.payments(order_id)
    WHERE status = 'SUCCESS';

-- 用户维度反查（我的支付记录 / 客服排查）
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payment.payments(user_id, created_at DESC);
