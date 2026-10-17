-- V80: 支付流水补渠道交易号
--
-- 接支付宝沙箱后，本地流水需要能对上渠道侧那笔交易：查询、退款、对账都靠它。
-- 可空：MOCK 渠道没有渠道单号；历史行也不回填。
ALTER TABLE payment.payments ADD COLUMN IF NOT EXISTS gateway_trade_no VARCHAR(64);

COMMENT ON COLUMN payment.payments.gateway_trade_no IS '渠道侧交易号（支付宝 trade_no）；MOCK 渠道为 NULL';
