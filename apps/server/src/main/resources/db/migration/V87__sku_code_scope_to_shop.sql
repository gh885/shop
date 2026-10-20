-- V87: SKU 业务编码的作用域从「全平台」收到「本店」
--
-- 问题：V7 建的是 uk_skus_code(sku_code) 全局唯一，PRD-33 也照此写。但 sku_code 是商家自己的
-- 仓管货号——同一品牌的多个经销商常用同一套 ERP 编号，同一 OEM 厂的贴牌货更是如此。全局唯一会让
-- 第二个商家在自己店里填一个「已存在」的编码时收到 409，而冲突方是谁按隐私口径又不能告诉他，
-- 商家无从自救。编码属于商家的命名空间，平台不该替商家管编码。
--
-- 修法：skus 冗余 shop_id（商品不换店，故一次写入），唯一索引改为 (shop_id, sku_code)，见 V88。
-- 为什么是冗余列而不是 join products 取 shop_id：唯一索引不能跨表，且按店查 SKU 顺带免回表。
--
-- 本文件只放普通 DDL：CONCURRENTLY 不能跑在事务里，与普通语句混写会触发 Flyway 的 mixed 检查
-- （见 V77 头部），所以索引那半边单独住在 V88。
--
-- NOT NULL 用「先建 NOT VALID 的 CHECK → 校验 → 再 SET NOT NULL」三步，不直接 SET NOT NULL：
-- 后者要对全表加 ACCESS EXCLUSIVE 并扫一遍；有了已校验的 CHECK，PG 12+ 会跳过那次扫描。
-- 表虽然小，但口径要统一——今天为小表开的口子，明天会被抄到千万行的大表上。

SET lock_timeout = '3s';

SET statement_timeout = '30s';

ALTER TABLE product.skus ADD COLUMN IF NOT EXISTS shop_id UUID;

-- 回填：存量行从所属 SPU 取 shop_id。skus 是小表（seed 百余行），这里不做分批
UPDATE product.skus s
SET shop_id = p.shop_id
FROM product.products p
WHERE p.id = s.product_id
  AND s.shop_id IS NULL;

-- Flyway 把整条迁移包在单事务里，失败即整体回滚；能不能重跑由 flyway_schema_history 判定，
-- 再加 IF NOT EXISTS 只会让「语句没生效」变成静默成功（V81 同一取舍）。所以 prefer-robust-stmts
-- 在这一族迁移上不适用，逐句豁免（squawk 的 ignore 只认紧邻上一行、且只收规则名列表）。
-- squawk-ignore prefer-robust-stmts
ALTER TABLE product.skus ADD CONSTRAINT ck_skus_shop_id_not_null CHECK (shop_id IS NOT NULL) NOT VALID;

-- squawk-ignore prefer-robust-stmts
ALTER TABLE product.skus VALIDATE CONSTRAINT ck_skus_shop_id_not_null;

-- 有了已校验的 CHECK，这一句不再扫表
-- squawk-ignore prefer-robust-stmts
ALTER TABLE product.skus ALTER COLUMN shop_id SET NOT NULL;

-- 这条约束只为「免扫表加 NOT NULL」而临时存在，NOT NULL 生效后它就该退役：留着是同一件事的第二份说法
-- squawk-ignore prefer-robust-stmts, ban-drop-constraint
ALTER TABLE product.skus DROP CONSTRAINT ck_skus_shop_id_not_null;

COMMENT ON COLUMN product.skus.shop_id IS '归属店铺（冗余自 product.products.shop_id，商品不换店故一次写入）；sku_code 的唯一性作用域';
