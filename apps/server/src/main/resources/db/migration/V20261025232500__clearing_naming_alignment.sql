SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- clearing 命名对齐：
--   freeze_item.source → source_account_type   装的是账户类型值（pending/available），
--                                              裸 source 太泛，看不出值域
--   ledger_entry.biz_date → effective_date     国际记账口径：账期归属日用 effective date
--                                              （posted_at 是记账时刻，两者本就是一对）
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clearing.freeze_item RENAME COLUMN source TO source_account_type;
ALTER TABLE clearing.ledger_entry RENAME COLUMN biz_date TO effective_date;
