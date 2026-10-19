-- V86: 在途部分索引去掉方向谓词 —— 让轨迹轮询也吃得上它
--
-- V83 建 idx_shipments_in_flight 时把谓词写成 status='DISPATCHED' AND direction='FORWARD'，
-- 但轮询候选（ShipmentMapper.selectStaleForPolling，LOG-24）刻意含逆向回寄（LOG-68：回寄照样要拉轨迹），
-- 查询谓词推不出 direction → 这个索引对轮询永远不可用，每 5 分钟一次全表扫。
-- 去掉方向谓词后：轮询直接命中；异常扫描的 WHERE 含 direction='FORWARD'，仍能命中这个更宽的部分索引。
-- 纯索引替换，无数据变更。
--
-- 走 CONCURRENTLY：shipments 是持续写的老表，普通 DROP 会拿 ACCESS EXCLUSIVE 把读写都停住。
-- DROP/CREATE CONCURRENTLY 都不能跑在事务里，与 SET 混写会触发 Flyway 的 mixed 检查直接报错
-- （见 V77/V79 头部）；前提 spring.flyway.postgresql.transactional-lock=false。
-- 中途失败会留下 INVALID 的同名索引，重跑前先 DROP INDEX CONCURRENTLY logistics.idx_shipments_in_flight。

-- squawk-ignore require-lock-timeout, require-statement-timeout
DROP INDEX CONCURRENTLY IF EXISTS logistics.idx_shipments_in_flight;

-- squawk-ignore require-lock-timeout, require-statement-timeout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipments_in_flight
    ON logistics.shipments(shipped_at)
    WHERE status = 'DISPATCHED';
