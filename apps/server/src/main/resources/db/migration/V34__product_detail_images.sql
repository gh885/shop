-- V34: 商品详情改为「图片流」——淘宝式详情是有序铺开的一组图片，不是一段富文本 HTML。
--      原 description(TEXT, 富文本 HTML) 删除；新增 detail_images(JSONB, 图片 key 数组, 按序渲染)。
--      图片一律存对象存储 key（相对路径，非完整 URL），展示时按当前环境拼 CDN 域名。

ALTER TABLE product.products ADD COLUMN detail_images JSONB NOT NULL DEFAULT '[]';

-- 存量开发数据：旧富文本无法自动还原成图片，回填为空图流（不造假 key 以免 404）。
-- 演示时经图片上传接口补图，再把 key 写进 detail_images。
UPDATE product.products SET detail_images = '[]';

ALTER TABLE product.products DROP COLUMN description;
