-- V8: Shop 模块 — shops 店铺表 + shop_members 店铺成员表

CREATE SCHEMA IF NOT EXISTS shop;

CREATE TABLE IF NOT EXISTS shop.shops (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    owner_id    UUID NOT NULL,                      -- 店主（主账号），跨 schema 裸引用 auth.users，不加 FK
    name        VARCHAR(50) NOT NULL,
    logo_key    VARCHAR(255),                       -- 店铺 logo 的对象存储 key（非完整 URL），可空
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW 待审核 / ACTIVE / REJECTED / DISABLED
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 店主反查「我的店铺」/ 鉴权
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shop.shops(owner_id);

CREATE TABLE IF NOT EXISTS shop.shop_members (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    shop_id     UUID NOT NULL,                      -- 所属店铺，shop.shops.id
    user_id     UUID NOT NULL,                      -- 成员用户，auth.users.id
    role        VARCHAR(20) NOT NULL,               -- OWNER 店主 / MEMBER 成员
    status      VARCHAR(20) NOT NULL,               -- PENDING 邀请待确认 / ACTIVE 已生效
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同店同人唯一；左前缀 shop_id 同时覆盖「查某店所有成员」，无需单列索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_shop_members_shop_user ON shop.shop_members(shop_id, user_id);

-- 鉴权按「用户 → 其所属店铺」反查
CREATE INDEX IF NOT EXISTS idx_shop_members_user_id ON shop.shop_members(user_id);
