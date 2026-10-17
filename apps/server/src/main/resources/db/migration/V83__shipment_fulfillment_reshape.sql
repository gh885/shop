-- V83: 订单域重构第三步 —— 发货单从「轨迹七态投影」改成「履约四态 + 行数量」
--
-- 对应 docs/domain/order-model.md §4.4 / §5.2 / §8：
--   * 发货单只管自己那条轴：待发货 → 已发出 → 已签收，旁支 已取消；状态由时间戳镜像，
--     不再由轨迹 rank 推导（轨迹只留展示用的节点，见 TrackingStage）
--   * 发货粒度到「订单行 + 数量」：logistics.shipment_lines 从骨架变成真正被写入，orders.items 的
--     shipped_quantity / settled_quantity 从交寄那一刻起累计
--   * 时间戳改名对齐模型：delivered_at → signed_at，新增 cancelled_at；shipped_at 可空（待发货时没有）
--
-- 无兼容负担：轨迹/包裹的存量行在上一步（V82 清空订单）之后已全是指向已删订单的孤儿，
-- 这里整段清掉再收紧约束，不做数据搬迁。
--
-- 幂等：DELETE / DROP IF EXISTS / ADD COLUMN IF NOT EXISTS 都可重复执行；CHECK 先 DROP 再 ADD。

-- ============================================================================
-- 1) 清掉指向已删订单的孤儿（V82 只清了 order / payment / aftersale，没清 logistics）
-- ============================================================================

DELETE FROM logistics.shipment_issues;
DELETE FROM logistics.tracking_nodes;
DELETE FROM logistics.shipment_lines;
DELETE FROM logistics.shipments;

-- ============================================================================
-- 2) 包裹：四态词表 + 时间戳镜像
-- ============================================================================

ALTER TABLE logistics.shipments
    ALTER COLUMN shipped_at DROP NOT NULL,
    ALTER COLUMN status SET DEFAULT 'PENDING_DISPATCH';

ALTER TABLE logistics.shipments RENAME COLUMN delivered_at TO signed_at;
ALTER TABLE logistics.shipments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE logistics.shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE logistics.shipments DROP CONSTRAINT IF EXISTS ck_shipments_status;
ALTER TABLE logistics.shipments
    ADD CONSTRAINT ck_shipments_status
    CHECK (status IN ('PENDING_DISPATCH', 'DISPATCHED', 'DELIVERED', 'CANCELLED'));

-- 状态是时间戳的镜像（INV-24 的包裹篇）：每个态该有的时刻必须有，不该有的时刻必须没有
ALTER TABLE logistics.shipments DROP CONSTRAINT IF EXISTS ck_shipments_status_fields;
ALTER TABLE logistics.shipments
    ADD CONSTRAINT ck_shipments_status_fields
    CHECK (
        (status = 'PENDING_DISPATCH' AND shipped_at IS NULL AND signed_at IS NULL AND cancelled_at IS NULL)
        OR (status = 'DISPATCHED' AND shipped_at IS NOT NULL AND signed_at IS NULL AND cancelled_at IS NULL)
        OR (status = 'DELIVERED' AND shipped_at IS NOT NULL AND signed_at IS NOT NULL AND cancelled_at IS NULL)
        OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
    );

COMMENT ON COLUMN logistics.shipments.status IS '履约状态：待发货 / 已发出 / 已签收 / 已取消；由 shipped_at / signed_at / cancelled_at 镜像（§4.4）';
COMMENT ON COLUMN logistics.shipments.signed_at IS '签收时刻；DELIVERED 必有，其余为空';
COMMENT ON COLUMN logistics.shipments.cancelled_at IS '取消时刻；CANCELLED 必有。取消已发出的包裹会让订单行的有效发货量回退';
COMMENT ON COLUMN logistics.shipments.shipped_at IS '交寄时刻；待发货为空。累计发出量只统计非空的包裹行';

-- 同一子订单同一时刻至多一张「待发货」包裹：打单是「先占一批行、再交寄」，两张未发出的单会把同一批货
-- 重复占位。库里可表达的最紧形状是按订单（跨表按订单行的部分唯一索引做不到），交寄时的行级守卫兜住剩余风险。
DROP INDEX IF EXISTS logistics.uk_shipments_pending_per_order;
CREATE UNIQUE INDEX uk_shipments_pending_per_order
    ON logistics.shipments(order_id) WHERE status = 'PENDING_DISPATCH';

-- 轨迹轮询 / 异常扫描的候选：不再看旧七态，只看在途的正向包裹
DROP INDEX IF EXISTS logistics.idx_shipments_unfinished_shipped;
CREATE INDEX idx_shipments_in_flight
    ON logistics.shipments(shipped_at)
    WHERE status = 'DISPATCHED' AND direction = 'FORWARD';

-- ============================================================================
-- 3) 发货单行：写入后要按订单反查（守卫与重算都读它）
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_shipment_lines_shipment ON logistics.shipment_lines(shipment_id);
