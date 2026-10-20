-- V90: 平台标准品的三条索引（表与挂靠列在 V89 建好）
--
-- 全走 CREATE INDEX CONCURRENTLY，且**本文件只放 CONCURRENTLY 语句**：它不能跑在事务里，
-- Flyway 的 PostgreSQL parser 认出语句前缀后会把整条迁移放到事务外执行
-- （ParserSqlScript#executeInTransaction）；同文件里混普通 DDL 会触发 mixed 检查直接报错。
-- 前提是 spring.flyway.postgresql.transactional-lock=false（application.yml），理由见 V65 头部。
--
-- 对一张刚落地的空表，CONCURRENTLY 的收益是零（没有并发写入可躲）。照样这么写，是因为
-- **口径统一比这一处的微小收益重要**：一旦允许「新表的索引可以普通建」，下一个人照抄的就是那个例外，
-- 而他要建索引的表大概率不是空的（V77 同一取舍）。
--
-- 三条各对应一类查询：
--   1. 条码是跨店识别最硬的依据，但不是每个标准品都有 → 部分唯一索引让「有码的才唯一」，
--      且只约束 ACTIVE（MERGED 的条码在合并时已释放，这里再兜一层）
--   2. 平台运营按类目翻标准品
--   3. 卖家按标准品找「我这店里还有哪些商品挂了它」

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uk_standard_products_barcode
    ON product.standard_products(barcode) WHERE barcode IS NOT NULL AND status = 'ACTIVE';

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_standard_products_category
    ON product.standard_products(category_id, created_at DESC);

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_standard_product
    ON product.products(standard_product_id) WHERE standard_product_id IS NOT NULL;
