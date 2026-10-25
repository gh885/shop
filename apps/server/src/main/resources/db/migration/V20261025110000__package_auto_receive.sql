SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 自动确认收货（AutoReceiveJob）要能在包裹上留下"谁确认的"：买家手点还是系统到期。
-- 争议时这是唯一证据——"我没收到货订单就完成了"的投诉，答案就在这一列。
-- 只在签收那一刻写入，和 delivered_at 同生共死。
ALTER TABLE fulfillment.package ADD COLUMN delivered_source text;

COMMENT ON COLUMN fulfillment.package.delivered_source IS
    '签收来源：buyer=买家手点，system=发货后到期自动确认；与 delivered_at 同生共死';

-- 已签收的存量行都是买家手点的（自动确认这一版才出现），补上来源让下面的配对约束能加上。
-- 一次性 UPDATE，不是数据迁移——约束要的是形状，不是历史。
UPDATE fulfillment.package SET delivered_source = 'buyer'
 WHERE status = 'delivered' AND delivered_source IS NULL;

-- 回填完了才敢上约束：约束在前，存量行当场违约，迁移根本过不去。
ALTER TABLE fulfillment.package
    ADD CONSTRAINT ck_package_delivered_source CHECK (delivered_source IN ('buyer', 'system')),
    ADD CONSTRAINT ck_package_delivered_pairing CHECK (
        (status = 'delivered') = (delivered_source IS NOT NULL));

-- 自动确认的扫描面：发货后一直没动静、过了宽限还没签收的包裹。
-- hourly 扫一次，部分索引让扫描不碰已签收/已取消的大多数。
CREATE INDEX idx_package_auto_receive ON fulfillment.package (shipped_at)
    WHERE status IN ('shipped', 'in_transit');
