-- V84: 买家主进度投影 —— 按 docs/domain/order-model.md §5.3 由主订单 + 子订单状态算出来的展示态
--
-- 为什么是视图而不是列：主进度是「读的时候按当前事实算」的展示态，不是账本（§5.2 每个实体只管自己那条轴）。
-- 落列就要维护写入口，而它依赖的子订单状态允许回退（取消已发出的包裹、退货都会改它），
-- 于是每个回退点都得记得回写一次——迟早漏。视图把「唯一的算法」放在读侧，写侧零负担。
--
-- 为什么算得出来：子订单状态本身就是从行账本重算出来的（FulfillmentRecalcService）——
--   PAID               = 一行都没结清（既没发过货，也没有成功的 item 退款，因为全退的单会被转成 CANCELLED）
--   PARTIALLY_SHIPPED  = 有行结清、仍有行未结清（发货或部分退款都算，§4.3 settled_quantity）
--   SHIPPED / COMPLETED= 全部行结清
--   CANCELLED          = 退出主进度判断（活跃 = status <> CANCELLED）
-- 所以 §5.3 的规则 3–6 只读子订单状态即可，不必再 JOIN 发货单/退款单：退款只要成功就一定落在 settled_quantity 上，
-- 未成功的请求不改账本，也就不会把「待发货」顶成「部分发货」。
--
-- 规则顺序与 §5.3 一一对应，命中即返回：
--   0 主订单待支付 → 待付款；1 主订单已关闭 → 已关闭；2 活跃子订单为空 → 已关闭；
--   3 活跃子订单全未结清 → 待发货；4 存在活跃子订单未结清 → 部分发货；
--   5 全部结清但未全部完成 → 待收货；6 全部完成 → 已完成。
CREATE OR REPLACE VIEW orders.trade_progress AS
SELECT
    t.id AS trade_id,
    CASE
        WHEN t.status = 'PENDING_PAYMENT' THEN 'PENDING_PAYMENT'
        WHEN t.status = 'CLOSED' THEN 'CLOSED'
        WHEN NOT EXISTS (
            SELECT 1 FROM orders.orders o
            WHERE o.trade_id = t.id AND o.status <> 'CANCELLED'
        ) THEN 'CLOSED'
        WHEN EXISTS (
            SELECT 1 FROM orders.orders o
            WHERE o.trade_id = t.id AND o.status IN ('PAID', 'PARTIALLY_SHIPPED')
        ) THEN CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM orders.orders o
                WHERE o.trade_id = t.id AND o.status <> 'CANCELLED' AND o.status <> 'PAID'
            ) THEN 'PENDING_SHIPMENT'
            ELSE 'PARTIALLY_SHIPPED'
        END
        WHEN NOT EXISTS (
            SELECT 1 FROM orders.orders o
            WHERE o.trade_id = t.id AND o.status <> 'CANCELLED' AND o.status <> 'COMPLETED'
        ) THEN 'COMPLETED'
        ELSE 'PENDING_RECEIPT'
    END AS main_progress
FROM orders.trades t;

COMMENT ON VIEW orders.trade_progress IS
    '买家主进度投影（§5.3）：按主订单状态 + 活跃子订单状态算出的展示态，不落表；列表筛选与详情展示共用这一份算法';

COMMENT ON COLUMN orders.trade_progress.main_progress IS
    'PENDING_PAYMENT 待付款 / PENDING_SHIPMENT 待发货 / PARTIALLY_SHIPPED 部分发货 / PENDING_RECEIPT 待收货 / COMPLETED 已完成 / CLOSED 已关闭';
