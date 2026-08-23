-- V16: Favorite 模块 — items 收藏条目表
-- 归属：营销/留存数据（将来接降价提醒、推荐）；SPU 级收藏（收藏的是商品不是规格）。
-- 纯追加删除表：取消收藏 = DELETE，行永远不被 UPDATE，故无 updated_at

CREATE SCHEMA IF NOT EXISTS favorite;

CREATE TABLE IF NOT EXISTS favorite.items (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id    UUID NOT NULL,               -- auth.users.id，跨 schema 裸引用不加 FK
    product_id UUID NOT NULL,               -- product.products.id（SPU 级），裸引用不加 FK
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 收藏是幂等开关：重复收藏同一商品不报错也不产生多行
CREATE UNIQUE INDEX IF NOT EXISTS uk_favorite_items_user_product
    ON favorite.items(user_id, product_id);
