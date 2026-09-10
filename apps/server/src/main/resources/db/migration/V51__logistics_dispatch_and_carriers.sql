-- V51: Logistics 二期 —— 发货入口归一（承运商字典 + 面单信息归包裹 + 一单多包裹 + 签收时刻）
-- 设计见 docs/decisions/logistics.md §4 二期。五处变更与动机：
--   1. 发货本质是物流动作，命令入口从 order 搬到 logistics：logistics 经 order :: api 的
--      OrderCommand.markShipped 推进订单状态。一期那条 OrderShippedEvent 随之删除——
--      单向依赖从 order :: events 换成 order :: api（仍是单向，不成环），因为发货方已是 logistics 自己，
--      再发事件给自己听没有意义。
--   2. 「物流公司」从卖家手打的自由文本升级为承运商字典 code：同一个顺丰五种写法，
--      既没法统计也没法对接物流商的接口。老端点为兼容前端保留，靠名字回查字典（匹配不上则 code 留空）。
--   3. 面单寄件人信息归位到包裹：它是面单（=包裹）的属性，一期错放在 orders（V41 引入）。
--      该数据从未出现在任何 HTTP 出参里，故本次搬家对契约不可见。
--   4. 一单可多包裹：去掉「一单一正向包裹」的唯一索引。订单状态仍由首个包裹推进，
--      后续包裹只追加记录并刷新订单上的物流摘要投影（不引入部分发货状态机）。
--   5. 签收是物流事实，落到订单上让「确认收货倒计时」从签收起算（未签收则按发货兜底，见 OrderTimeouts）。

-- ---- 1) 承运商字典 ----
CREATE TABLE IF NOT EXISTS logistics.carriers (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
    code       VARCHAR(32) NOT NULL UNIQUE,   -- 稳定标识（顺丰 SF），对接物流商接口时用它
    name       VARCHAR(64) NOT NULL,          -- 展示名（顺丰速运）
    enabled    BOOLEAN NOT NULL DEFAULT TRUE, -- 停用后不可再选，历史单据不受影响
    sort_no    INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一期种子的七家主流承运商（管理端维护通道未开，改字典暂走迁移）
INSERT INTO logistics.carriers (code, name, sort_no) VALUES
    ('SF', '顺丰速运', 10),
    ('ZTO', '中通快递', 20),
    ('YTO', '圆通速递', 30),
    ('STO', '申通快递', 40),
    ('YD', '韵达快递', 50),
    ('JD', '京东物流', 60),
    ('JT', '极兔速递', 70),
    ('EMS', '邮政EMS', 80)
ON CONFLICT (code) DO NOTHING;

-- ---- 2) 包裹表：承运商 code + 面单寄件人（从 orders 搬来） ----
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS carrier_code VARCHAR(32);
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS ship_from_contact_name   VARCHAR(30);
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS ship_from_phone          VARCHAR(20);
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS ship_from_province       VARCHAR(30);
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS ship_from_city           VARCHAR(30);
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS ship_from_district       VARCHAR(30);
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS ship_from_detail         VARCHAR(120);
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS ship_from_company_name   VARCHAR(60);

-- ---- 3) 一单多包裹：唯一索引换成普通索引（拆包/分批发） ----
DROP INDEX IF EXISTS logistics.uk_shipments_order_forward;
CREATE INDEX IF NOT EXISTS idx_shipments_order ON logistics.shipments(order_id, direction);

-- ---- 4) 订单侧：签收时刻（收货倒计时改从它起算）+ 交出寄件人列 ----
ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE orders.orders
    DROP COLUMN IF EXISTS shipper_contact_name,
    DROP COLUMN IF EXISTS shipper_phone,
    DROP COLUMN IF EXISTS shipper_province,
    DROP COLUMN IF EXISTS shipper_city,
    DROP COLUMN IF EXISTS shipper_district,
    DROP COLUMN IF EXISTS shipper_detail,
    DROP COLUMN IF EXISTS shipper_company_name;
