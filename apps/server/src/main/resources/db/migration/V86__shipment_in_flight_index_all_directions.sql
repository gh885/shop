-- V86: 在途部分索引去掉方向谓词 —— 让轨迹轮询也吃得上它
--
-- V83 建 idx_shipments_in_flight 时把谓词写成 status='DISPATCHED' AND direction='FORWARD'，
-- 但轮询候选（ShipmentMapper.selectStaleForPolling，LOG-24）刻意含逆向回寄（LOG-68：回寄照样要拉轨迹），
-- 查询谓词推不出 direction → 这个索引对轮询永远不可用，每 5 分钟一次全表扫。
-- 去掉方向谓词后：轮询直接命中；异常扫描的 WHERE 含 direction='FORWARD'，仍能命中这个更宽的部分索引。
-- 纯索引替换，无数据变更。

DROP INDEX IF EXISTS logistics.idx_shipments_in_flight;
CREATE INDEX idx_shipments_in_flight
    ON logistics.shipments(shipped_at)
    WHERE status = 'DISPATCHED';
