SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 商家治理的最小集：只回答“这个商家现在能不能卖这个类目/品牌”。
-- 完整的违规、处置、申诉、保证金见 docs/domain/seller-governance.md，后续迁移再补。
CREATE SCHEMA IF NOT EXISTS trust;

COMMENT ON SCHEMA trust IS '商家治理：资格、类目/品牌授权、资质、违规与处置';

CREATE TABLE trust.seller_profile
(
    merchant_id uuid PRIMARY KEY,
    status      text        NOT NULL DEFAULT 'applied',
    level       text        NOT NULL DEFAULT 'L1',
    points_12m  integer     NOT NULL DEFAULT 0,
    joined_at   timestamptz,
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_profile_status CHECK (status IN
        ('applied', 'reviewing', 'active', 'suspended', 'closing', 'closed', 'rejected')),
    CONSTRAINT ck_profile_points CHECK (points_12m >= 0)
);

CREATE TABLE trust.category_grant
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    merchant_id uuid        NOT NULL,
    category_id uuid        NOT NULL,
    status      text        NOT NULL DEFAULT 'active',
    source      text        NOT NULL DEFAULT 'platform',
    granted_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz,
    revoked_at  timestamptz,

    CONSTRAINT uq_category_grant UNIQUE (merchant_id, category_id),
    CONSTRAINT ck_category_grant_status CHECK (status IN ('active', 'suspended', 'revoked'))
);

CREATE INDEX idx_category_grant_category ON trust.category_grant (category_id);

CREATE TABLE trust.brand_grant
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    merchant_id uuid        NOT NULL,
    brand_id    uuid        NOT NULL,
    category_id uuid        NOT NULL,
    status      text        NOT NULL DEFAULT 'active',
    granted_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz,

    CONSTRAINT uq_brand_grant UNIQUE (merchant_id, brand_id, category_id),
    CONSTRAINT ck_brand_grant_status CHECK (status IN ('active', 'suspended', 'revoked'))
);

CREATE INDEX idx_brand_grant_brand ON trust.brand_grant (brand_id, category_id);

CREATE TABLE trust.credential
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    merchant_id uuid        NOT NULL,
    category_id uuid,
    type        text        NOT NULL,
    status      text        NOT NULL DEFAULT 'valid',
    issued_at   timestamptz,
    expires_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_credential_status CHECK (status IN ('pending', 'valid', 'expiring', 'expired', 'rejected'))
);

CREATE INDEX idx_credential_merchant ON trust.credential (merchant_id, category_id);
