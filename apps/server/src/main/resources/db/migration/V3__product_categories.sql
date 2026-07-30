-- V3: Product 模块 — product schema + categories 类目树

CREATE SCHEMA IF NOT EXISTS product;

CREATE TABLE IF NOT EXISTS product.categories (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    parent_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    name        VARCHAR(64) NOT NULL,
    level       SMALLINT NOT NULL,
    sort        INT NOT NULL DEFAULT 0,
    status      SMALLINT NOT NULL DEFAULT 1,
    icon_url    VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同级类目不重名
CREATE UNIQUE INDEX IF NOT EXISTS uk_categories_parent_name ON product.categories(parent_id, name);

-- 树查询按 parent_id 拉子节点
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON product.categories(parent_id);
