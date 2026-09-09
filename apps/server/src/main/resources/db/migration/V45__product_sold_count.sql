-- V45: Product 模块 — products 增加累计销量投影列 sold_count
-- 之前销量由 order 模块按已完成订单实时聚合（order.api.ProductSoldReadQuery 实现 product.api.ProductSoldQuery），
-- 编译期无环、运行期 product 却持有 order 的实现。改为 product 自持的投影列，
-- 订单完成时经 product.api :: ProductCommand.addSold 同事务累加。口径不变：仅已完成订单行项数量加总，退款不回冲。

ALTER TABLE product.products ADD COLUMN IF NOT EXISTS sold_count BIGINT NOT NULL DEFAULT 0;

-- 一次性回填历史已完成订单（迁移脚本层面跨 schema 读一次；运行期代码仍禁止跨 schema JOIN）
UPDATE product.products p
SET sold_count = s.sold
FROM (
    SELECT i.product_id, SUM(i.quantity) AS sold
    FROM orders.items i
    JOIN orders.orders o ON o.id = i.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY i.product_id
) s
WHERE p.id = s.product_id;
