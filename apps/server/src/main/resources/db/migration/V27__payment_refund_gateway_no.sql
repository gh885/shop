-- V27: 渠道侧退款单号 —— 退款不再只是「改状态」，先经 PaymentGateway 提交真实渠道，
-- 受理后回填渠道侧退款单号（refund_gateway_no），对账/客服凭它把本地 REFUNDED 与渠道侧那笔退款对上。
-- 发起支付时渠道侧交易号（gateway_trade_no）在接真实网关时随那批落库，V1 MOCK 不预建列。

ALTER TABLE payment.payments
    ADD COLUMN IF NOT EXISTS refund_gateway_no VARCHAR(64);  -- 渠道侧退款单号（MOCK 为本地生成的 MOCK-REFUND-<paymentId>）
