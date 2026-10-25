SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 删掉被完全覆盖的唯一约束 uq_refund_biz。
--
-- V20261025100000 加了表达式唯一索引 uq_refund_suspense_biz
-- (payment_id, COALESCE(seller_order_id, 零 uuid), reason)：非 NULL 子单的判定
-- 与 uq_refund_biz 完全相同，NULL 子单（挂账退款）只有它管。约束从此只是第二份
-- 唯一索引——白付每次写入的维护，还给人「NULL 重复也兜住了」的错觉。
-- RefundOrderMapper.insert 的 ON CONFLICT 从一开始指的就是表达式索引，代码不用改。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payment.refund_order DROP CONSTRAINT uq_refund_biz;
