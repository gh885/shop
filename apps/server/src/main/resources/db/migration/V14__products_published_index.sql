-- V14: products 补买家侧部分索引
-- 买家商品流默认查询形态（ProductService.pagePublic）：
--   WHERE status = 1 [+ category_id/shop_id 筛选] ORDER BY created_at DESC, id DESC
-- 原有 shop_id/category_id 单列索引无法免排序，首页默认浏览只能全表扫描 + top-N 排序。
-- 部分索引只含上架商品（买家可见子集），体量小且与查询形态精确匹配。

CREATE INDEX IF NOT EXISTS idx_products_published_created
    ON product.products (created_at DESC, id DESC)
    WHERE status = 1;
