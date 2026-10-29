SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 标准品的识别键按类目分区。
--
-- 原来 `uq_spu_standard_match (identity_kind, match_key)` 是全局唯一。`param_hash` 的键
-- 只由属性 code + 值拼成（白牌货没有品牌前缀），两个不同类目只要属性 code 撞了、取值相同，
-- 就会共用一个标准品——随后同款聚合与比价把两个不相干的商品放进同一个列表。
--
-- 把 `category_id` 加进唯一索引，`findStandardId` 也按类目查：同一个识别键在不同类目下
-- 是两个标准品。索引变宽只会放宽约束，存量数据不会因此冲突。
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX catalog.uq_spu_standard_match;

CREATE UNIQUE INDEX uq_spu_standard_match
    ON catalog.spu (category_id, identity_kind, match_key)
    WHERE spu_type = 'standard';

COMMENT ON INDEX catalog.uq_spu_standard_match IS
    '标准品防重：同一类目下一个识别键只能有一个标准品。跨类目的同键是合法的（参数哈希不含类目）';
