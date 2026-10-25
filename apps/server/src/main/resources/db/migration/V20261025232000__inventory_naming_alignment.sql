SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- inventory 命名对齐：
--   stock_log → stock_ledger   它的注释自己写着「这是账，不是日志」——账本就叫 ledger，
--                              与 clearing.ledger_entry 同一哲学：只追加、可重算、是真相源
-- 索引、唯一约束、只追加触发器随表改名。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory.stock_log RENAME TO stock_ledger;

ALTER INDEX inventory.idx_stock_log_sku RENAME TO idx_stock_ledger_sku;
ALTER INDEX inventory.uq_stock_log_idem RENAME TO uq_stock_ledger_idem;
ALTER TRIGGER trg_stock_log_append_only ON inventory.stock_ledger RENAME TO trg_stock_ledger_append_only;

-- CHECK 约束名跟随表名；ref_type 的 'after_sale' 死值一并改成 'rma' 对齐词汇
-- （当前 Java 只写 'order' / 'manual'，UPDATE 是给存量行兜底）。
UPDATE inventory.stock_ledger SET ref_type = 'rma' WHERE ref_type = 'after_sale';

ALTER TABLE inventory.stock_ledger DROP CONSTRAINT ck_stock_log_ref_type;
ALTER TABLE inventory.stock_ledger
    ADD CONSTRAINT ck_stock_ledger_ref_type
        CHECK (ref_type IS NULL OR ref_type IN ('order', 'rma', 'manual'));

ALTER TABLE inventory.stock_ledger RENAME CONSTRAINT ck_stock_log_type TO ck_stock_ledger_type;
ALTER TABLE inventory.stock_ledger RENAME CONSTRAINT ck_stock_log_operator TO ck_stock_ledger_operator;
ALTER TABLE inventory.stock_ledger RENAME CONSTRAINT ck_stock_log_commit TO ck_stock_ledger_commit;
ALTER TABLE inventory.stock_ledger RENAME CONSTRAINT ck_stock_log_moved TO ck_stock_ledger_moved;
