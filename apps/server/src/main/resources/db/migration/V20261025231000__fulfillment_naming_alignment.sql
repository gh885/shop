SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- fulfillment 命名对齐：
--   last_track_at → last_trace_at   轨迹域词汇统一用 trace（logistics.trace_event 同源），
--                                   track 留给承运商原始单号 tracking_no 的语境
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fulfillment.package RENAME COLUMN last_track_at TO last_trace_at;
