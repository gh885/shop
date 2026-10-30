-- trace 视图的查询是"按 trace_id 取整条链的所有事件"，且必然带 project_id。
-- 原来的 ix_event_trace (trace_id) 只有一列：跨项目查同一条 trace_id 时会先捞别人的行再过滤，
-- 而在真实环境里 trace_id 是客户端随机生成的，理论上不该重复，但"依赖数据不会重复"的索引没见过好下场。
CREATE INDEX ix_event_project_trace ON telemetry.event (project_id, trace_id) WHERE trace_id IS NOT NULL;

-- 单列版本被上面这个完全覆盖
DROP INDEX telemetry.ix_event_trace;
