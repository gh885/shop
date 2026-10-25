SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- account 命名对齐：
--   nickname → display_name   与 seller.operator.display_name 统一——同是「对外显示名」，
--                             一个概念全库一个名字
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE account.buyer RENAME COLUMN nickname TO display_name;
