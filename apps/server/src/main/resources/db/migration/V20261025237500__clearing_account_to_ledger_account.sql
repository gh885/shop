SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- clearing.account → clearing.ledger_account。
-- 「account」一词曾三义（买家账号 account.* / 资金账户 clearing.account / 员工账号
-- staff.account）。资金账户改叫 ledger_account 后与 ledger_entry 同族；这一义拆掉后，
-- account schema 归买家账号独占。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clearing.account RENAME TO ledger_account;

ALTER TABLE clearing.ledger_account RENAME CONSTRAINT uq_account_owner TO uq_ledger_account_owner;
ALTER TABLE clearing.ledger_account RENAME CONSTRAINT ck_account_owner_type TO ck_ledger_account_owner_type;
ALTER TABLE clearing.ledger_account RENAME CONSTRAINT ck_account_type TO ck_ledger_account_type;

COMMENT ON TABLE clearing.ledger_account IS '资金账户（ledger account）；余额是分录的缓存，可随时重算';
