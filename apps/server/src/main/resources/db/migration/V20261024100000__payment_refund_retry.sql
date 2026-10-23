SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 退款重试通道。
--
-- 以前渠道没受理的退款单永远停在 pending，没有任何任务会再碰它——一次渠道抖动就把
-- 售后单永久卡在 refunding，只能人工改库。现在 RefundRetryJob 定时重扫 pending，
-- attempts 记渠道尝试次数，超上限留给人工（状态不变，日志和扫描都能看见）。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payment.refund_order ADD COLUMN attempts integer NOT NULL DEFAULT 0;

ALTER TABLE payment.refund_order
    ADD CONSTRAINT ck_refund_attempts CHECK (attempts >= 0);

COMMENT ON COLUMN payment.refund_order.attempts IS
    '渠道退款尝试次数（同步首试计入 pending 后的每次重试）；超过上限留给人工';

-- 重试扫描只走这个部分索引
CREATE INDEX idx_refund_pending_retry
    ON payment.refund_order (created_at)
    WHERE status = 'pending';
