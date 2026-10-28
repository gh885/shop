SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 店铺范围贯穿：seller_order 的 shop_id 冗余到 package 与 rma_case。
--
-- operator_shop 授权的店铺范围要在这两张表的卖家侧查询上生效（子账号只看授权店的
-- 包裹与售后），而它们的主表只有 merchant_id；跨 schema JOIN trade.seller_order 取
-- shop_id 是铁律禁止的，运行时逐条回查 trade :: api 又是列表页付不起的往返。
-- shop_id 在子单上不可变（订单不属于哪个店这件事不会变），冗余没有漂移风险。
--
-- 无需数据迁移兼容：回填只服务本地已存在的开发数据。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE returns.rma_case ADD COLUMN shop_id uuid;

UPDATE returns.rma_case c
   SET shop_id = s.shop_id
  FROM trade.seller_order s
 WHERE s.id = c.seller_order_id;

ALTER TABLE returns.rma_case ALTER COLUMN shop_id SET NOT NULL;

CREATE INDEX idx_rma_case_shop ON returns.rma_case (merchant_id, shop_id);

ALTER TABLE fulfillment.package ADD COLUMN shop_id uuid;

UPDATE fulfillment.package p
   SET shop_id = s.shop_id
  FROM trade.seller_order s
 WHERE s.id = p.seller_order_id;

ALTER TABLE fulfillment.package ALTER COLUMN shop_id SET NOT NULL;

CREATE INDEX idx_package_shop ON fulfillment.package (merchant_id, shop_id);

-- 修正说谎的注释：店没有自己的商品与结算账户——商品库、库存、定价、资金都在 merchant，
-- 店是渠道窗口（按店上下架、按店授权子账号）。
COMMENT ON TABLE seller.shop IS
    '渠道窗口：共享商家的商品库、库存与资金，按店上下架与授权。子账号的店铺范围以它为单位';
