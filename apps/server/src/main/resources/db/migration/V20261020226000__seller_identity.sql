SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 卖家侧身份：商家 / 店铺 / 操作账号 / 角色 / 授权
--
-- 形状照淘宝，但有个必须说清的纠正：它不是「会员 → 店 → 子账号 → 岗位」那条链，
-- 是两棵树 + 两张交叉表：
--
--   merchant ─┬─ shop
--             └─ operator ──[operator_role]── role ──[role_permission]── permission
--                     └──────[operator_shop]── shop
--
-- 为什么不是链：
--   1. operator 属于 merchant，不属于 shop——一个客服必须能同时管多个店
--   2. operator 与 role 是多对多——一个人可以既是客服又是运营，权限取并集
--   3. 数据范围（能看哪些店）是独立维度，不塞进角色里，否则「客服-店A」「客服-店B」角色爆炸
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS seller;

COMMENT ON SCHEMA seller IS '卖家侧：商家、店铺、子账号、角色与授权';

CREATE TABLE seller.merchant
(
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    name       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_merchant_status CHECK (status IN ('active', 'suspended', 'closed'))
);

CREATE TABLE seller.shop
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    merchant_id uuid        NOT NULL,
    name        text        NOT NULL,
    status      text        NOT NULL DEFAULT 'active',
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_shop_status CHECK (status IN ('active', 'closed'))
);

CREATE INDEX idx_shop_merchant ON seller.shop (merchant_id);

COMMENT ON TABLE seller.shop IS '独立经营单元：有自己的商品、订单、客服与结算账户。权限按 shop 授权';

-- 主账号和子账号是同一张表，靠 is_primary 区分。
-- 不拆两张表：登录、审计、归属判断都要对两者一视同仁，拆开就得处处 if。
CREATE TABLE seller.operator
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    merchant_id   uuid        NOT NULL,
    login_name    text        NOT NULL,
    password_hash text        NOT NULL,
    display_name  text        NOT NULL,
    is_primary    boolean     NOT NULL DEFAULT false,
    status        text        NOT NULL DEFAULT 'active',
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_operator_login UNIQUE (login_name),
    CONSTRAINT ck_operator_status CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX idx_operator_merchant ON seller.operator (merchant_id);

-- 一个商家最多一个主账号（部分唯一索引，PG 支持 WHERE 条件）
CREATE UNIQUE INDEX uq_operator_primary ON seller.operator (merchant_id) WHERE is_primary;

CREATE TABLE seller.role
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    merchant_id uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_role_code UNIQUE (merchant_id, code)
);

-- 角色 → 权限点。permission_code 不加外键：跨 schema 不建外键是硬规矩，
-- 一致性由 Authorizer 启动时的枚举比对 + 迁移评审保证。
CREATE TABLE seller.role_permission
(
    role_id         uuid NOT NULL,
    permission_code text NOT NULL,

    CONSTRAINT pk_role_permission PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE seller.operator_role
(
    operator_id uuid NOT NULL,
    role_id     uuid NOT NULL,

    CONSTRAINT pk_operator_role PRIMARY KEY (operator_id, role_id)
);

-- 数据范围：这个账号能操作哪些店。和功能权限分开配，是淘宝那套的关键。
CREATE TABLE seller.operator_shop
(
    operator_id uuid NOT NULL,
    shop_id     uuid NOT NULL,

    CONSTRAINT pk_operator_shop PRIMARY KEY (operator_id, shop_id)
);
