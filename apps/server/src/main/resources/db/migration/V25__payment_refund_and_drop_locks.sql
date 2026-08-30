-- V25: 支付流水补退款终态 + 移除从未使用的分布式锁表
--
-- 1) payments.refunded_at
--    已付款订单允许买家取消（状态机 PAID → CANCELLED），此前库存回补了、支付流水却还留在 SUCCESS
--    ——「订单已取消、货款仍显示已收」的资金口径漏洞。补 REFUNDED 终态与退款时刻列，取消事务内
--    经 order :: events 的 OrderCancelledEvent 同步落单据（见 PaymentRefundListener）。
--    注：V18 头注释写的「流水只插不改」在两段式支付（PENDING → SUCCESS 条件转移）落地时已不成立，
--    本版正式承认流水可改状态；金额/渠道/归属仍然落库后不变。
--    uk_payments_order_success 是 WHERE status = 'SUCCESS' 的部分唯一索引，转 REFUNDED 后索引自动
--    放开——不构成重复支付风险：此时订单已 CANCELLED，OrderCommand.markPaid 的条件转移会拒绝。
--
-- 2) DROP kernel.distributed_locks
--    V1 建表至今零引用。唯一的候选场景（超时关单多实例并发）由 OrderCloseService.closeOne 的条件更新
--    保证正确性，不需要抢锁；真要上锁也应优先 pg_try_advisory_xact_lock（事务结束自动释放、实例崩溃
--    无残留锁），不必自建锁表背 TTL 兼顾。留着只会让人误以为系统有分布式锁基建。

ALTER TABLE payment.payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

COMMENT ON COLUMN payment.payments.refunded_at IS '退款时刻：已付款订单取消时回填，与 status = REFUNDED 同时写入';

DROP TABLE IF EXISTS kernel.distributed_locks;
