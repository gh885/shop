SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- staff.account → staff.member：拆掉「account」三义的最后一角。
-- 与 seller.operator（商家子账号）、account.buyer（买家）三套身份不共用表。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE staff.account RENAME TO member;

COMMENT ON TABLE staff.member IS '平台员工账号；三套身份（买家/商家员工/平台员工）不共用表';
