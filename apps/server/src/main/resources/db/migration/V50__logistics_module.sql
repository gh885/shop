-- V50: Logistics 模块 —— 包裹与轨迹从 orders 的两个裸字符串列升格为独立模块
-- 现行规则见 docs/business-rules/logistics.md（本行为一期建模块时的边界，后续以 V51 起的规则为准）。边界：logistics 是 order 的下游（单向消费 OrderShippedEvent 落包裹），
-- order 不认识本模块——故本 schema 是轨迹的唯一真相源，orders.logistics_company / tracking_no 仍是发货快照，
-- 二期发货入口归一后才改为本模块经 order :: api 写回的投影。
-- 一期不建承运商字典（发货仍是自由文本、无消费者），二期随发货入口归一并加。

CREATE SCHEMA IF NOT EXISTS logistics;

-- 包裹：一次发货一行。一期一单一包裹（正向），拆包/逆向靠 direction 与索引演进，不改表结构。
CREATE TABLE IF NOT EXISTS logistics.shipments (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id      UUID NOT NULL,                 -- orders.orders.id，跨 schema 裸引用不加 FK
    user_id       UUID NOT NULL,                 -- 买家，account.users.id；买家查轨迹的归属依据
    shop_id       UUID NOT NULL,                 -- 卖家店铺，shop.shops.id
    direction     VARCHAR(10) NOT NULL DEFAULT 'FORWARD' CHECK (direction IN ('FORWARD', 'RETURN')),
    carrier_name  VARCHAR(50) NOT NULL,          -- 承运商展示名，发货时刻快照（改名不改写历史单据）
    tracking_no   VARCHAR(64) NOT NULL,          -- 运单号
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING_PICKUP'
                  CHECK (status IN ('PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERING', 'DELIVERED', 'RETURNED', 'EXCEPTION')),
                  -- 状态是 tracking_nodes 的投影，由 ShipmentStatus 的 rank 单调推进（已签收不会被「运输中」覆盖）
    shipped_at    TIMESTAMPTZ NOT NULL,          -- 发货时刻（事件携带，与 orders.shipped_at 同源）
    delivered_at  TIMESTAMPTZ,                   -- 签收时刻（DELIVERED 节点回填）
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一个运单号只属于一个订单（重复发货 / 事件重投由它兜底）
CREATE UNIQUE INDEX IF NOT EXISTS uk_shipments_tracking_no ON logistics.shipments(tracking_no);
-- 一期一单一包裹（正向）；二期支持拆包时删除本索引，改为 (order_id, direction) 普通索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_shipments_order_forward ON logistics.shipments(order_id) WHERE direction = 'FORWARD';
CREATE INDEX IF NOT EXISTS idx_shipments_shop_status ON logistics.shipments(shop_id, status);

-- 轨迹节点：append-only 事实（只插不改，故无 updated_at）。状态由节点推导，节点不因状态变更而修改。
CREATE TABLE IF NOT EXISTS logistics.tracking_nodes (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    shipment_id UUID NOT NULL,                 -- logistics.shipments.id
    node_code   VARCHAR(30) NOT NULL,          -- 归一化节点码（TrackingNodeCode），承运商原始码不进本表
    description VARCHAR(200),                  -- 承运商原始描述（展示用，不参与状态推导）
    location    VARCHAR(100),
    occurred_at TIMESTAMPTZ NOT NULL,          -- 承运商事件发生时刻（排序与状态推进依据）
    dedupe_key  VARCHAR(200) NOT NULL,         -- shipmentId|nodeCode|occurredAt|location，重推由唯一键挡住
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 去重：投递方重推会换 message id，只有业务唯一键可靠
CREATE UNIQUE INDEX IF NOT EXISTS uk_tracking_nodes_dedupe ON logistics.tracking_nodes(dedupe_key);
-- 轨迹展示主路径：按包裹时间正序（id 兜同时刻排序）
CREATE INDEX IF NOT EXISTS idx_tracking_nodes_shipment ON logistics.tracking_nodes(shipment_id, occurred_at, id);
