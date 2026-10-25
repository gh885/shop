SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- inventory 可售量 available → available_to_promise（ERP 术语 ATP 的全称）。
-- 用全称不用裸缩写 atp：仓库风格忌讳无解释缩写（bp 有注释、g 有单位，ATP 同理写全）。
-- 守恒式 ck_stock_balance 引用列名，列 RENAME 后自动跟随，不用重建。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory.stock RENAME COLUMN available TO available_to_promise;
ALTER TABLE inventory.stock_ledger RENAME COLUMN before_available TO before_available_to_promise;
ALTER TABLE inventory.stock_ledger RENAME COLUMN after_available TO after_available_to_promise;

COMMENT ON COLUMN inventory.stock.available_to_promise IS
    '可售量（available to promise, ATP）；允许为负：负 = 已经超卖，进告警，不是 bug';
