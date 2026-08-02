-- V6: Product 模块 — products 商品(SPU)表

CREATE TABLE IF NOT EXISTS product.products (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    shop_id     UUID NOT NULL,                      -- 归属店铺（跨 schema 裸引用，不加 FK）
    category_id UUID NOT NULL,                      -- 主分类
    name        VARCHAR(128) NOT NULL,
    subtitle    VARCHAR(255),
    description TEXT,
    main_image  VARCHAR(255),
    images      JSONB NOT NULL DEFAULT '[]',        -- 轮播图 URL 数组
    specs       JSONB NOT NULL DEFAULT '[]',        -- 销售属性模板，SKU 由此生成
    params      JSONB NOT NULL DEFAULT '[]',        -- 非销售参数，仅展示
    min_price   BIGINT,                             -- SKU 聚合最低价（分）
    max_price   BIGINT,                             -- SKU 聚合最高价（分）
    status      SMALLINT NOT NULL DEFAULT 1,        -- 1 上架 / 0 下架 / 2 草稿
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 商家后台「我的商品」列表按 shop_id 查
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON product.products(shop_id);

-- 分类页按 category_id 查
CREATE INDEX IF NOT EXISTS idx_products_category_id ON product.products(category_id);
