-- V67: 商品名称/副标题模糊搜索索引。
-- 一期保留现有包含匹配语义，pg_trgm 让 '%keyword%' 走 GIN；外部搜索服务留作未来 ADR 的可选项。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON product.products USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_subtitle_trgm
    ON product.products USING GIN (subtitle gin_trgm_ops);
