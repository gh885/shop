-- V49: Order 模块 — orders 增加结算幂等键 checkout_key
-- 下单此前无幂等：双击或网络超时后重试会生成两组订单并冻结两次库存，只靠前端按钮态兜底。
-- 前端进入结算页时生成一个 UUID，同一次结算的所有提交都带它；一次结算每店一单，故 (user_id, checkout_key, shop_id) 唯一。
-- 重复提交在主表 insert 处撞键（第二个事务阻塞等第一个提交后报冲突），库存冻结执行不到第二次；
-- 撞键后由 OrderPlacementService 在事务外回读原单返回。历史行与 dev 种子（DevOrderDataSeeder）为 NULL，走部分索引不受约束。

ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS checkout_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uk_orders_user_checkout_shop
    ON orders.orders (user_id, checkout_key, shop_id) WHERE checkout_key IS NOT NULL;
