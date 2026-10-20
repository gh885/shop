-- V88: sku_code 唯一索引改为「店内唯一」（shop_id 列在 V87 加好并回填）
--
-- 旧索引 uk_skus_code(sku_code) 全局唯一，与「编码是商家自己的货号」这个语义冲突（理由见 V87 头）。
-- 新索引 (shop_id, sku_code)：同一商家内仍不允许重号，不同商家互不影响。
--
-- 走 CONCURRENTLY：skus 是持续写的老表，普通 DROP/CREATE 会拿 ACCESS EXCLUSIVE 把读写停住。
-- 本文件只放 CONCURRENTLY 语句——它不能跑在事务里，与普通 DDL 混在同一文件 Flyway 直接报
-- mixed 检查错（见 V77 头部）。前提 spring.flyway.postgresql.transactional-lock=false（application.yml）。
--
-- sku_code 可空：唯一索引里多个 NULL 不冲突（PG 默认 NULLS DISTINCT），「没有货号的 SKU」照旧能建。
-- 中途失败会留下 INVALID 的同名索引，重跑前先 DROP INDEX CONCURRENTLY product.uk_skus_shop_code。

-- squawk-ignore require-lock-timeout, require-statement-timeout
DROP INDEX CONCURRENTLY IF EXISTS product.uk_skus_code;

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uk_skus_shop_code
    ON product.skus(shop_id, sku_code);
