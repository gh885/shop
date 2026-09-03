-- =====================================================================
-- V39: Product 模块 — 图片字段统一存「对象存储 key」，剥离历史完整 URL
--
-- 背景：此前上传链路把后端拼的完整七牛 URL（= publicBaseUrl + key）直接入库，
-- 而展示端约定「图片字段只存 key、用 imgUrl(key) 拼域名」（见 apps/*/shared/lib/image.ts）。
-- 存完整 URL 的副作用：一旦换域名/协议（如七牛测试域名只能 http、生产自有域名 https），
-- 历史数据即失效；存 key 则换域名只改环境变量、历史与新增数据恒可拼。
--
-- 本脚本把已有数据里命中「七牛测试域名前缀」的完整 URL，剥离成相对 key（去掉域名前缀）。
-- 前缀覆盖 http:// 与 https:// 两种（测试域名 *_tkowmtfov.hb-bkt.clouddn.com_ 仅 http 可用，
-- 但曾误配 https 入库，一并归一）。非该域名的值（如已有 key 或别的域名）不受影响。
-- =====================================================================

-- 1) product.products.main_image（单值 varchar）
UPDATE product.products
SET main_image = regexp_replace(main_image, '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/', '')
WHERE main_image ~ '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/';

-- 2) product.products.images（轮播图 JSONB 字符串数组），按原顺序保留
UPDATE product.products
SET images = (
    SELECT COALESCE(
        jsonb_agg(regexp_replace(e, '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/', '') ORDER BY ord),
        '[]'::jsonb
    )
    FROM jsonb_array_elements_text(images) WITH ORDINALITY AS t(e, ord)
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(images) AS e
    WHERE e ~ '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/'
);

-- 3) product.products.detail_images（详情图 JSONB 字符串数组），按原顺序保留
UPDATE product.products
SET detail_images = (
    SELECT COALESCE(
        jsonb_agg(regexp_replace(e, '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/', '') ORDER BY ord),
        '[]'::jsonb
    )
    FROM jsonb_array_elements_text(detail_images) WITH ORDINALITY AS t(e, ord)
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(detail_images) AS e
    WHERE e ~ '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/'
);

-- 4) product.skus.image（单值 varchar）
UPDATE product.skus
SET image = regexp_replace(image, '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/', '')
WHERE image ~ '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/';

-- 5) product.category_attr_values.image（规格值默认图，单值 varchar）
UPDATE product.category_attr_values
SET image = regexp_replace(image, '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/', '')
WHERE image ~ '^https?://tkowmtfov\.hb-bkt\.clouddn\.com/';
