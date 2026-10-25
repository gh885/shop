SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- returns 命名对齐：
--   case_log.actor_* → operator_*   与 audit_log / stock_ledger / 安全层统一
--                                    （operator=操作者，全库一个词）
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE returns.case_log RENAME COLUMN actor_type TO operator_type;
ALTER TABLE returns.case_log RENAME COLUMN actor_id TO operator_id;
