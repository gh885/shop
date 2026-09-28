-- V72: 买家延长收货（ORD-63）
-- 动机：确认收货窗口默认「发货起 7 天、签收后重算 7 天」（ORD-28），碰上出差、换货、等配件这类正常事由，
--       买家只能眼看着自动确认把单转完成、售后窗口一起开始跑。淘宝/京东都有「延长收货」这个动作，
--       成本极低（推迟一个截止列），而买家侧的体感是「我还没收到货，别替我确认」。
--
-- 设计取舍：
--   * 只加一列计数，不加「延长记录表」：额度限死 1 次（OrderTimeouts.MAX_RECEIVE_EXTENSIONS），
--     一次动作只产出一个新截止时刻，过程无歧义，落一张多行表是过度建模。
--   * 计数用 INT 而非 BOOLEAN：上限将来若放宽到 2~3 次，闸门是同一个 WHERE 条件，不必再迁移。
--   * 不动 apply_expire_at：售后申请窗口从**完成时刻**起算，而完成时刻随 receive_expire_at 一起推迟，
--     完成时才回填，两条时限天然衔接（ORD-53）。
--
-- 约束：CHECK 把「延长次数」钉在 0~1，杜绝任何路径把计数写成负数或越界（越界会让延长闸门形同虚设）。
ALTER TABLE orders.orders
    ADD COLUMN IF NOT EXISTS receive_extended_count INT NOT NULL DEFAULT 0;

ALTER TABLE orders.orders
    DROP CONSTRAINT IF EXISTS ck_orders_receive_extended_count;

ALTER TABLE orders.orders
    ADD CONSTRAINT ck_orders_receive_extended_count CHECK (receive_extended_count BETWEEN 0 AND 1);

COMMENT ON COLUMN orders.orders.receive_extended_count IS '确认收货窗口已延长次数（ORD-63，额度 1 次，计数不参与任何业务判定之外的口径）';
