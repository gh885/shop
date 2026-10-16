-- V79: payments 的结算归组回读索引（列在 V78 加好）
-- 供 (user_id, checkout_key) 回读原批；部分索引只覆盖有 key 的批次行。
--
-- 走 CONCURRENTLY：payments 是有数据的老表，普通建索引会把写锁住。本文件只放 CONCURRENTLY 语句——
-- 它不能跑在事务里，与 SET 混在同一文件 Flyway 直接报 mixed 检查错（见 V77 头部）。
-- 前提 spring.flyway.postgresql.transactional-lock=false（application.yml）。
--
-- 前一行 squawk 豁免不是「规则不适用」，是「它和 CONCURRENTLY 互斥」：require-lock-timeout /
-- require-statement-timeout 要的 SET 是事务内语句，写进来这条迁移就飞不起来。V77 同一处矛盾选同一解。

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_checkout_key
    ON payment.payments (user_id, checkout_key) WHERE checkout_key IS NOT NULL;
