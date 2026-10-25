SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- trust → governance：模块/schema/权限点统一改名，与 docs/domain/seller-governance.md
-- 的文档名对齐（文档早就叫 governance，库和代码追认）。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER SCHEMA trust RENAME TO governance;

COMMENT ON SCHEMA governance IS '商家治理：资格、类目/品牌授权、资质、违规与处置';

UPDATE common.permission
   SET code = 'GOVERNANCE_REVIEW', description = '查看违规线索（履约超时等，只读）'
 WHERE code = 'TRUST_REVIEW';

UPDATE staff.role_permission
   SET permission_code = 'GOVERNANCE_REVIEW'
 WHERE permission_code = 'TRUST_REVIEW';
