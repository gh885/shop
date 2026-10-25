SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 售后冻结 freeze → hold（国际支付/结算惯用 authorization hold）。
-- 连带两个值域：hold_item.status 与 clearing 账户类型里的 'frozen' → 'held'，
-- 值变了所以 CHECK 要重建；部分索引谓词带值，一并重建。
-- catalog.category 的 'frozen' 是类目状态，另一义，不动。
--
-- posting_group.biz_no 里的历史 'freeze:' 前缀**不改**：posting_group 只追加
-- （触发器拦 UPDATE），幂等键改前缀等于承认旧键作废——开发库存量行保留原前缀，
-- 新写入一律 'hold:'。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clearing.freeze_item RENAME TO hold_item;

ALTER TABLE clearing.hold_item DROP CONSTRAINT ck_freeze_status;
ALTER TABLE clearing.hold_item ALTER COLUMN status SET DEFAULT 'held';
UPDATE clearing.hold_item SET status = 'held' WHERE status = 'frozen';
ALTER TABLE clearing.hold_item
    ADD CONSTRAINT ck_hold_status CHECK (status IN ('held', 'released', 'consumed'));
ALTER TABLE clearing.hold_item RENAME CONSTRAINT ck_freeze_amount TO ck_hold_amount;
ALTER TABLE clearing.hold_item RENAME CONSTRAINT ck_freeze_source TO ck_hold_source;

DROP INDEX clearing.idx_freeze_open;
DROP INDEX clearing.idx_freeze_item_order;
CREATE INDEX idx_hold_open ON clearing.hold_item (merchant_id) WHERE status = 'held';
CREATE INDEX idx_hold_item_order ON clearing.hold_item (seller_order_id) WHERE status = 'held';

ALTER TABLE clearing.account DROP CONSTRAINT ck_account_type;
UPDATE clearing.account SET account_type = 'held' WHERE account_type = 'frozen';
ALTER TABLE clearing.account
    ADD CONSTRAINT ck_account_type
        CHECK (account_type IN ('available', 'pending', 'held', 'deposit', 'suspense'));

COMMENT ON TABLE clearing.hold_item IS '售后占用（hold）：一个 case 一行；amount 是商家净额部分（佣金不占用）';
