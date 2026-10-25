SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- audit.audit_log → audit.entry：去掉 schema=模块带来的结巴，与 clearing.ledger_entry
-- 的 entry 词汇一致；Java 侧 AuditEntry 记录类本就叫这个名。
-- 15 个月分区 + DEFAULT 分区一并改名（分区表名不会跟随父表）。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit.audit_log RENAME TO entry;

DO
$$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relispartition
           AND n.nspname = 'audit'
           AND c.relname LIKE 'audit\_log\_%'
    LOOP
        EXECUTE format('ALTER TABLE audit.%I RENAME TO %I', r.relname,
                       regexp_replace(r.relname, '^audit_log_', 'entry_'));
    END LOOP;
END
$$;

ALTER INDEX audit.idx_audit_log_object RENAME TO idx_entry_object;
ALTER TRIGGER trg_audit_log_append_only ON audit.entry RENAME TO trg_entry_append_only;

ALTER TABLE audit.entry RENAME CONSTRAINT pk_audit_log TO pk_entry;
ALTER TABLE audit.entry RENAME CONSTRAINT ck_audit_log_operator_type TO ck_entry_operator_type;
ALTER TABLE audit.entry RENAME CONSTRAINT ck_audit_log_result TO ck_entry_result;
