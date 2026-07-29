-- V2: Auth 模块 — auth schema + users 表

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id BIGINT GENERATED ALAWYS AS IDENTITY PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255),
    nickname VARCHAR(50),
    avatar_key VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON auth.users(phone);
