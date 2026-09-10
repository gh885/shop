-- V52: Logistics 四期 —— 物流异常单（揽收超时 / 中转停滞 / 派送停滞）
-- 动机：包裹卡在某个环节没有任何动静时，系统此前是"安静的"——买家打电话来问，客服才去查。
-- 异常单把"该有动静却没有"变成一条可被处理的记录，让客服在买家开口之前就知道该催谁。
--
-- 设计取舍：
--   * 异常单是<b>扫描的产物</b>，不是承运商推送的事实：判据只有时间（某状态下停了多久没动静），
--     因此可以离线复算、可以调阈值重扫，不依赖对方是否真的推了"异常"状态。
--   * 同一包裹同一类异常同时只留一张未结单（部分唯一索引）——每轮扫描都建一张会让列表变成噪音。
--   * 包裹走到终态（签收/退回）时未结单自动结单：异常不再需要人处理，留在列表里就是假待办。

CREATE TABLE IF NOT EXISTS logistics.shipment_issues (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    shipment_id UUID NOT NULL,                 -- logistics.shipments.id
    type        VARCHAR(24) NOT NULL
                CHECK (type IN ('PICKUP_TIMEOUT', 'TRANSIT_STALLED', 'DELIVERY_STALLED')),
    status      VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
    detail      VARCHAR(200),                  -- 人话说明（含停滞时长/最后一条轨迹），供客服直接念
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同一包裹同一类异常至多一张未结单：并发扫描由唯一索引兜底（应用层抓 DuplicateKey 跳过）
CREATE UNIQUE INDEX IF NOT EXISTS uk_shipment_issues_open
    ON logistics.shipment_issues(shipment_id, type) WHERE status = 'OPEN';

-- 客服列表主路径：未结单按发现时间倒序
CREATE INDEX IF NOT EXISTS idx_shipment_issues_open
    ON logistics.shipment_issues(status, detected_at DESC);
