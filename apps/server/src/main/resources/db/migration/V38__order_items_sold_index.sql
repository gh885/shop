-- V38: 卖家工作台「商品列表」累计销量聚合的覆盖索引
--
-- 销量口径：只统计已完成订单（orders.status='COMPLETED'）。聚合 SQL 为
--   SELECT i.product_id, SUM(i.quantity) FROM orders.items i
--   JOIN orders.orders o ON o.id = i.order_id
--   WHERE o.shop_id = ? AND o.status = 'COMPLETED' AND i.product_id IN (...) GROUP BY i.product_id
--
-- 现有 idx_orders_shop_created(shop_id, created_at DESC) 前缀能过滤 shop_id，但 status 不在索引内；
-- 加 (shop_id, status, created_at DESC) 让「按店铺 + 状态」过滤不进表回扫，聚合走索引覆盖。

CREATE INDEX IF NOT EXISTS idx_orders_shop_status_created
    ON orders.orders (shop_id, status, created_at DESC);
