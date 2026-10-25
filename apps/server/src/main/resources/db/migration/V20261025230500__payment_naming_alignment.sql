SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- payment 命名对齐：
--   pay_no → payment_no      与 order_no / refund_no / payout_no 的 <完整实体>_no 模式统一
--   expire_at → expires_at   与全库统一
--   matched → amount_matched 裸布尔改语义名：它是「回调金额与应付是否相符」，不是泛指匹配
-- 约束与索引随列：uq_payment_pay_no → uq_payment_no（顺带去重复音节）。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payment.payment_order RENAME COLUMN pay_no TO payment_no;
ALTER TABLE payment.payment_order RENAME COLUMN expire_at TO expires_at;
ALTER TABLE payment.payment_order RENAME COLUMN matched TO amount_matched;

ALTER INDEX payment.uq_payment_pay_no RENAME TO uq_payment_no;
ALTER INDEX payment.idx_payment_pending_expire RENAME TO idx_payment_pending_expires;
