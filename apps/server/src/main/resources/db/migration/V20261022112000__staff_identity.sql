SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 平台员工身份。三套身份域的第三套，与 account.buyer、seller.operator 完全独立，不共用表。
--
-- 为什么不复用 seller.operator：那一行有 merchant_id，整个权限模型都建立在"属于某个商家"上。
-- 平台运营不属于任何商家，硬塞进去要么让 merchant_id 可空（然后所有判断都要防 null），
-- 要么给平台运营造一个假商家（然后它出现在商家列表里）。
--
-- 岗位（role）与权限点（permission）的关系：岗位是给人看的，权限点是给代码判的。
-- 三个岗位是文档定的最小集，不引更多。
CREATE SCHEMA IF NOT EXISTS staff;

COMMENT ON SCHEMA staff IS '平台员工：账号、岗位、会话';

CREATE TABLE staff.account
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    login_name    text        NOT NULL,
    password_hash text        NOT NULL,
    display_name  text        NOT NULL,
    role          text        NOT NULL,
    status        text        NOT NULL DEFAULT 'active',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_staff_login UNIQUE (login_name),
    -- 三个岗位照 docs 定：审核、运营、超管。超管额外能管员工。
    CONSTRAINT ck_staff_role CHECK (role IN ('REVIEWER', 'OPS', 'SUPER_ADMIN')),
    CONSTRAINT ck_staff_status CHECK (status IN ('active', 'disabled'))
);

COMMENT ON TABLE staff.account IS '平台员工账号。与买家、卖家账号是三套独立身份，靠 JWT 的 typ 声明区分';

CREATE INDEX idx_staff_role ON staff.account (role, status);

-- 岗位 → 权限点。权限点本身住 common.permission（三端共用清单）。
--
-- 不加外键：跨 schema 不建外键是硬规矩。一致性由 Authorizer 启动时的枚举比对保证，
-- 这里漏一个权限点会让那项功能对某个岗位永远为假——静默失败，所以有 StaffPermissionSeed 兜底。
CREATE TABLE staff.role_permission
(
    role            text NOT NULL,
    permission_code text NOT NULL,

    CONSTRAINT pk_staff_role_permission PRIMARY KEY (role, permission_code),
    CONSTRAINT ck_staff_rp_role CHECK (role IN ('REVIEWER', 'OPS', 'SUPER_ADMIN'))
);

-- 三个岗位的权限分配。文档 §1 定的：审核看店铺审核和治理，运营看类目/内容/物流，
-- 超管全都要（含员工管理）。
--
-- 为什么用 INSERT ... SELECT 而不是 VALUES 硬编码：权限点清单在 common.permission，
-- 这里只写"哪个岗位有哪些"，改清单不用改这里。
INSERT INTO staff.role_permission (role, permission_code)
SELECT 'REVIEWER', code FROM common.permission WHERE code IN (
    'SHOP_REVIEW', 'SHOP_GOVERNANCE', 'AUDIT_VIEW'
)
ON CONFLICT DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'OPS', code FROM common.permission WHERE code IN (
    'CATEGORY_MANAGE', 'CMS_MANAGE', 'LOGISTICS_MANAGE', 'COUPON_OPS', 'AUDIT_VIEW', 'RUM_VIEW', 'SHOP_GOVERNANCE'
)
ON CONFLICT DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', code FROM common.permission
ON CONFLICT DO NOTHING;

CREATE TRIGGER trg_staff_touch BEFORE UPDATE ON staff.account
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();
