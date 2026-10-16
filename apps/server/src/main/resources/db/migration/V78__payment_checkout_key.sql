-- V78: Payment 模块 — payments 增加结算归组键 checkout_key
-- 一次多店结算拆出的 N 张单要能在收银台合并成一次支付：N 条流水共享同一 checkout_key（= orders.orders.checkout_key），
-- 发起时按 key 逐单复用/补建 PENDING，确认时按 key 整批 PENDING→SUCCESS + 逐单 markPaid（同事务、任一单被取消整批回滚）。
-- 单店/来自订单列表的逐单支付不写这一列（NULL），仍走 order_id 维度的既有一单一成功流水幂等索引。
-- 部分索引只覆盖有 key 的批次行，供 (user_id, checkout_key) 回读原批。

ALTER TABLE payment.payments ADD COLUMN IF NOT EXISTS checkout_key UUID;

CREATE INDEX IF NOT EXISTS idx_payments_checkout_key
    ON payment.payments (user_id, checkout_key) WHERE checkout_key IS NOT NULL;
