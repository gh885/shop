-- V11: User 模块 — addresses 收货地址表
-- 归属：买家个人资料数据，独立于订单；order 模块结算时按 ID 只读跨 schema 查询
-- label：业务层区分内置枚举(HOME/WORK/SCHOOL/PARENTS/FRIEND)与自定义文案，DB 只存一个字符串

CREATE SCHEMA IF NOT EXISTS user_profile;

CREATE TABLE IF NOT EXISTS user_profile.addresses (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id       UUID NOT NULL,              -- 归属买家，auth.users.id，跨 schema 裸引用不加 FK
    receiver_name VARCHAR(30) NOT NULL,       -- 收件人
    phone         VARCHAR(20) NOT NULL,       -- 收件手机号（≠ 账号手机号，可代收）
    region_code   VARCHAR(12) NOT NULL,       -- 行政区划代码（国标），用于映射省市区
    province      VARCHAR(30) NOT NULL,       -- 省（冗余展示）
    city          VARCHAR(30) NOT NULL,       -- 市
    district      VARCHAR(30) NOT NULL,       -- 区/县
    detail        VARCHAR(120) NOT NULL,      -- 街道/门牌号详细地址
    label         VARCHAR(20) NOT NULL DEFAULT 'HOME', -- 内置枚举 code 或自定义文案
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at    TIMESTAMPTZ,                -- 软删除标记，NULL=有效
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 按买家查地址列表
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON user_profile.addresses(user_id);

-- 每个买家至多一个默认地址（部分唯一索引，只约束 is_default=TRUE 且未删的行）
CREATE UNIQUE INDEX IF NOT EXISTS uk_addresses_default ON user_profile.addresses(user_id)
    WHERE is_default = TRUE AND deleted_at IS NULL;
