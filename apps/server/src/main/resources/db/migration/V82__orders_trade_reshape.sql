-- V82: 订单域重构第二步 —— 子订单让位给主订单：地址/幂等键/支付时限上移，履约词表去掉待付款
--
-- 对应 docs/domain/order-model.md §5.1/§5.2 与 §4.2：
--   * 子订单随下单创建，初始 status = 待发货（PAID），paid_at 为空；「未支付」由主订单状态表达，
--     子订单不再有 PENDING_PAYMENT 态
--   * 地址快照 / checkout_key / pay_expire_at 只属于主订单，子订单删列
--   * 履约态补 PARTIALLY_SHIPPED；取消是唯一旁支
--
-- 无兼容负担：旧订单/流水/售后单直接清空（dev 与测试库自建数据），不写数据搬迁。
-- 清空顺序按父后子：order_status_log → items → orders；payment 与 aftersale 各自独立但在同一事务里一并清，
-- 避免留下指向已删订单的孤儿售后单（aftersale 三表在批次④整体退出）。
--
-- 幂等：本迁移只在空表上收紧约束，重跑时 DELETE 与 ALTER 都可重复执行。

-- ============================================================================
-- 1) 清空旧形状（无兼容负担，不做数据搬迁）
-- ============================================================================

DELETE FROM orders.order_status_log;
DELETE FROM orders.items;
DELETE FROM orders.orders;
DELETE FROM payment.payments;
DELETE FROM aftersale.ticket_events;
DELETE FROM aftersale.tickets;

-- ============================================================================
-- 2) 子订单：地址 / checkout_key / pay_expire 上移主订单，状态词表换挡
-- ============================================================================

-- 收货快照与幂等键、支付时限只属于主订单；子订单按 trade_id 回查
ALTER TABLE orders.orders
    DROP COLUMN IF EXISTS receiver_name,
    DROP COLUMN IF EXISTS receiver_phone,
    DROP COLUMN IF EXISTS receiver_region_code,
    DROP COLUMN IF EXISTS receiver_province,
    DROP COLUMN IF EXISTS receiver_city,
    DROP COLUMN IF EXISTS receiver_district,
    DROP COLUMN IF EXISTS receiver_detail,
    DROP COLUMN IF EXISTS buyer_message,
    DROP COLUMN IF EXISTS checkout_key,
    DROP COLUMN IF EXISTS pay_expire_at;

ALTER TABLE orders.orders ALTER COLUMN trade_id SET NOT NULL;

-- 旧的按 (user_id, checkout_key, shop_id) 幂等索引随列消失；主订单侧已有 (user_id, checkout_key) 唯一
DROP INDEX IF EXISTS orders.uk_orders_user_checkout_shop;

-- 一个卖家在同一张主订单下只出现一次：trade_id 已非空，去掉部分谓词
DROP INDEX IF EXISTS orders.uk_orders_trade_shop;
CREATE UNIQUE INDEX uk_orders_trade_shop ON orders.orders(trade_id, shop_id);

-- 履约词表：去掉 PENDING_PAYMENT（支付前的事实归主订单），补部分发货
ALTER TABLE orders.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders.orders DROP CONSTRAINT IF EXISTS ck_orders_status;
ALTER TABLE orders.orders
    ADD CONSTRAINT ck_orders_status
    CHECK (status IN ('PAID', 'PARTIALLY_SHIPPED', 'SHIPPED', 'COMPLETED', 'CANCELLED'));

ALTER TABLE orders.orders ALTER COLUMN status SET DEFAULT 'PAID';

COMMENT ON COLUMN orders.orders.status IS '履约状态：待发货 PAID / 部分发货 / 已发货 / 已完成 / 已取消；未支付由主订单状态表达';

-- ============================================================================
-- 3) 订单行：分摊等式在写入路径落地后一并进库（旧行已清空，可直接收紧）
-- ============================================================================

ALTER TABLE orders.items
    ADD CONSTRAINT ck_order_items_goods_paid
        CHECK (goods_paid_amount = amount - discount_allocated),
    ADD CONSTRAINT ck_order_items_refundable
        CHECK (refundable_amount = goods_paid_amount + shipping_allocated);

-- ============================================================================
-- 4) 支付流水：归属主订单；一笔支付覆盖多张子订单，但流水仍按子订单各记一条
--    （渠道退款按子订单金额发起；「一次支付 = 一张主订单」由 trade_id 表达，批次④再收口退款单）
-- ============================================================================

ALTER TABLE payment.payments ALTER COLUMN trade_id SET NOT NULL;

-- checkout_key 由主订单承载，流水不再需要
DROP INDEX IF EXISTS payment.idx_payments_checkout_key;
ALTER TABLE payment.payments DROP COLUMN IF EXISTS checkout_key;

COMMENT ON COLUMN payment.payments.trade_id IS '所属主订单 orders.trades.id；同一 trade 的多条流水共享它';
COMMENT ON COLUMN payment.payments.order_id IS '所属子订单 orders.orders.id：渠道退款按子订单金额发起，批次④改由退款单承载';
