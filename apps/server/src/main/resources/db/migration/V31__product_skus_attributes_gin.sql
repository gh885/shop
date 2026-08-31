-- V31: product.skus.attributes 加 GIN 索引，支撑「按 valueId 反查引用 SKU」
--
-- 场景：类目属性值改名（CategoryAttrService.updateValue）要刷新所有引用该 valueId 的 SKU 快照。
-- 原实现用 spec_key LIKE '%<uuid>%' 定位——前导通配任何索引都用不上，每次改名全表扫 product.skus。
-- 改用 JSONB containment（attributes @> '[{"valueId":"..."}]'），由本 GIN 索引支撑。
--
-- 选 jsonb_path_ops 而非默认 jsonb_ops：只支持 @> 一种操作符，但索引更小、@> 查询更快，
-- 而本列的检索需求就只有 @>（键名固定、按值反查），不需要 ? / ?| / ?& 那些键存在性操作符。
CREATE INDEX IF NOT EXISTS idx_skus_attributes_gin
    ON product.skus USING GIN (attributes jsonb_path_ops);
