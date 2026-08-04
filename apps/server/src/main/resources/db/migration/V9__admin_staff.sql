-- V9: Admin 模块 — staff 平台员工表 + shop_reviews 店铺入驻审核表

CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.staff (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    employee_no   VARCHAR(50) NOT NULL,             -- 工号，登录账号
    password_hash VARCHAR(255) NOT NULL,            -- BCrypt，平台员工用工号+密码登录，不走手机验证码
    display_name  VARCHAR(50),
    status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 工号全局唯一（登录账号）
CREATE UNIQUE INDEX IF NOT EXISTS uk_staff_employee_no ON admin.staff(employee_no);

CREATE TABLE IF NOT EXISTS admin.shop_reviews (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    shop_id     UUID NOT NULL,                      -- 被审核店铺，跨 schema 裸引用 shop.shops.id
    staff_id    UUID,                               -- 审批员工 admin.staff.id，PENDING 时为 NULL
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING 待审 / APPROVED 通过 / REJECTED 拒绝
    reason      VARCHAR(255),                       -- 审批备注，拒绝时一般必填
    decided_at  TIMESTAMPTZ,                        -- 审批时间，PENDING 时为 NULL
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 审核队列按 status 查
CREATE INDEX IF NOT EXISTS idx_shop_reviews_status ON admin.shop_reviews(status);

-- 按店查审核历史
CREATE INDEX IF NOT EXISTS idx_shop_reviews_shop_id ON admin.shop_reviews(shop_id);
