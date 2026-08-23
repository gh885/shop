-- V15: Cart 模块 — items 购物车条目表
-- 归属：交易前置数据，登录态购物车（不做游客合并）；商品展示信息不冗余，
-- 读取时按 ID 只读跨 schema 查 product.skus / product.products，价格快照是 order 模块的职责

CREATE SCHEMA IF NOT EXISTS cart;

CREATE TABLE IF NOT EXISTS cart.items (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id    UUID NOT NULL,               -- auth.users.id，跨 schema 裸引用不加 FK
    sku_id     UUID NOT NULL,               -- product.skus.id，跨 schema 裸引用不加 FK
    quantity   INT NOT NULL CHECK (quantity BETWEEN 1 AND 999), -- DB 兜底防脏数据；真实限购由 service 校验
    selected   BOOLEAN NOT NULL DEFAULT TRUE, -- 结算勾选位，落库保证跨设备一致
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 重复加购同一 SKU 合并为数量累加；左前缀 user_id 覆盖「查某人整个购物车」唯一高频查询
CREATE UNIQUE INDEX IF NOT EXISTS uk_cart_items_user_sku ON cart.items(user_id, sku_id);
