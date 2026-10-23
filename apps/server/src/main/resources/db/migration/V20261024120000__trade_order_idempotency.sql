SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 下单幂等键落地。
--
-- 以前这个字段从 API 一路透传进 placeOrder 后没人读：防重只靠 uq_order_group_quote
-- （一张报价一单），客户端重新试算拿到新 quoteId（网络超时重试、双击都会）就能对同一车货
-- 下两单、占两份库存。现在 (buyer_id, idempotency_key) 唯一索引兜底，placeOrder 入口用
-- 事务级 advisory lock 把同键的并发请求串起来——后到的直接返回先到的订单。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE trade.order_group ADD COLUMN idempotency_key text;

CREATE UNIQUE INDEX uq_order_group_idem
    ON trade.order_group (buyer_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN trade.order_group.idempotency_key IS
    '客户端下单幂等键；同键重复请求返回先创建的订单，不重复占库存';
