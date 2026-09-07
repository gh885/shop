-- V40: Address 模块 — 商家发货/退货/揽收/账单地址（买家收货地址仍在 user_profile.addresses）
-- 归属：店铺履约责任主体（地址本体 merchant_address.addresses + 履约角色 merchant_address.address_roles）
-- 设计要点：
--   * 地址本体（是哪里/找谁/怎么联系）与用途角色（在哪家店/干嘛用/面单写谁）分离 —— 同一物理地址可复用多角色
--   * 一个店铺某角色至多一个默认（部分唯一索引），默认未显式存在时由 api 层按兜底规则解析
--   * 面单主体 entity_name 挂在角色上（跟用途走），不跟物理地址走

CREATE SCHEMA IF NOT EXISTS merchant_address;

-- 地址本体：物理地址 + 联系人
CREATE TABLE IF NOT EXISTS merchant_address.addresses (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    shop_id       UUID NOT NULL,                -- 归属店铺，shop.shops.id，跨 schema 裸引用不加 FK
    contact_name  VARCHAR(30) NOT NULL,         -- 联系人/取件人
    phone         VARCHAR(20) NOT NULL,         -- 电话（面单取件联系，≠ 账号手机号）
    region_code   VARCHAR(12) NOT NULL,         -- 国标行政区划码
    province      VARCHAR(30) NOT NULL,         -- 省（冗余展示）
    city          VARCHAR(30) NOT NULL,         -- 市
    district      VARCHAR(30),                  -- 区/县（直辖市/直筒子市可为空）
    detail        VARCHAR(120) NOT NULL,        -- 街道/门牌号详细地址
    postal_code   VARCHAR(6),                   -- 邮编（可选）
    status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE / DISABLED
    deleted_at    TIMESTAMPTZ,                  -- 软删除标记，NULL=有效
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_addresses_shop
    ON merchant_address.addresses(shop_id) WHERE deleted_at IS NULL;

-- 履约角色：同一物理地址在不同店铺/用途下的扮演（默认、面单主体、别名）
CREATE TABLE IF NOT EXISTS merchant_address.address_roles (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    address_id    UUID NOT NULL,                -- merchant_address.addresses.id，同 schema 保持裸引用风格
    shop_id       UUID NOT NULL,                -- 冗余店铺归属，圈查询与默认唯一索引用
    role_type     VARCHAR(16) NOT NULL,         -- SHIP_FROM / RETURN_TO / PICKUP / INVOICE
    alias_name    VARCHAR(30),                  -- 「主仓」「售后仓」别名（界面选择用，不影响面单）
    entity_name   VARCHAR(60),                  -- 面单寄件人/收件方名称（履约主体）
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_address_roles_address ON merchant_address.address_roles(address_id);
CREATE INDEX IF NOT EXISTS idx_address_roles_shop_role ON merchant_address.address_roles(shop_id, role_type);

-- 一个店铺某角色至多一个默认（部分唯一索引，只约束启用且未删角色的默认标记）
CREATE UNIQUE INDEX IF NOT EXISTS uk_address_role_default
    ON merchant_address.address_roles(shop_id, role_type)
    WHERE is_default = TRUE AND enabled = TRUE;
