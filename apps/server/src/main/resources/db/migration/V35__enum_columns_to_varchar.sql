-- V35: 将仍用 SMALLINT 的状态/类型列统一改为 varchar 枚举名存储，并补 CHECK 约束

-- ===== product 模块 =====

-- 商品 SPU 状态：0 OFF / 1 PUBLISHED / 2 DRAFT
-- 先删除依赖旧 int 值的 partial index，类型转换完再重建
DROP INDEX IF EXISTS product.idx_products_published_created;
ALTER TABLE product.products
    ALTER COLUMN status TYPE VARCHAR(20)
        USING CASE status
                  WHEN 0 THEN 'OFF'
                  WHEN 1 THEN 'PUBLISHED'
                  WHEN 2 THEN 'DRAFT'
            END,
    ALTER COLUMN status SET DEFAULT 'PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_products_published_created
    ON product.products (created_at DESC, id DESC)
    WHERE status = 'PUBLISHED';

-- SKU 在售状态：0 DISABLED / 1 ON_SALE
ALTER TABLE product.skus
    ALTER COLUMN status TYPE VARCHAR(20)
        USING CASE status
                  WHEN 0 THEN 'DISABLED'
                  WHEN 1 THEN 'ON_SALE'
            END,
    ALTER COLUMN status SET DEFAULT 'ON_SALE';

-- 类目状态：0 DISABLED / 1 ENABLED
ALTER TABLE product.categories
    ALTER COLUMN status TYPE VARCHAR(20)
        USING CASE status
                  WHEN 0 THEN 'DISABLED'
                  WHEN 1 THEN 'ENABLED'
            END,
    ALTER COLUMN status SET DEFAULT 'ENABLED';

-- 类目属性类型：1 SPEC / 2 PARAM
ALTER TABLE product.category_attrs
    ALTER COLUMN kind TYPE VARCHAR(20)
        USING CASE kind
                  WHEN 1 THEN 'SPEC'
                  WHEN 2 THEN 'PARAM'
            END;

-- 类目属性启用状态：0 DISABLED / 1 ENABLED
ALTER TABLE product.category_attrs
    ALTER COLUMN status TYPE VARCHAR(20)
        USING CASE status
                  WHEN 0 THEN 'DISABLED'
                  WHEN 1 THEN 'ENABLED'
            END,
    ALTER COLUMN status SET DEFAULT 'ENABLED';

-- 类目属性值来源：1 PLATFORM / 2 SELLER
ALTER TABLE product.category_attr_values
    ALTER COLUMN source TYPE VARCHAR(20)
        USING CASE source
                  WHEN 1 THEN 'PLATFORM'
                  WHEN 2 THEN 'SELLER'
            END,
    ALTER COLUMN source SET DEFAULT 'PLATFORM';

-- ===== cms 模块 =====

-- CMS 内容启用状态：0 DISABLED / 1 ENABLED
ALTER TABLE cms.banners
    ALTER COLUMN status TYPE VARCHAR(20)
        USING CASE status
                  WHEN 0 THEN 'DISABLED'
                  WHEN 1 THEN 'ENABLED'
            END,
    ALTER COLUMN status SET DEFAULT 'ENABLED';

ALTER TABLE cms.nav_entries
    ALTER COLUMN status TYPE VARCHAR(20)
        USING CASE status
                  WHEN 0 THEN 'DISABLED'
                  WHEN 1 THEN 'ENABLED'
            END,
    ALTER COLUMN status SET DEFAULT 'ENABLED';

ALTER TABLE cms.recommend_tabs
    ALTER COLUMN status TYPE VARCHAR(20)
        USING CASE status
                  WHEN 0 THEN 'DISABLED'
                  WHEN 1 THEN 'ENABLED'
            END,
    ALTER COLUMN status SET DEFAULT 'ENABLED';

-- ===== CHECK 约束（类型转换完成后再加，避免事务内类型可见性问题） =====

ALTER TABLE product.products ADD CONSTRAINT chk_products_status
    CHECK (status IN ('OFF', 'PUBLISHED', 'DRAFT'));
ALTER TABLE product.skus ADD CONSTRAINT chk_skus_status
    CHECK (status IN ('DISABLED', 'ON_SALE'));
ALTER TABLE product.categories ADD CONSTRAINT chk_categories_status
    CHECK (status IN ('DISABLED', 'ENABLED'));
ALTER TABLE product.category_attrs ADD CONSTRAINT chk_category_attrs_kind
    CHECK (kind IN ('SPEC', 'PARAM'));
ALTER TABLE product.category_attrs ADD CONSTRAINT chk_category_attrs_status
    CHECK (status IN ('DISABLED', 'ENABLED'));
ALTER TABLE product.category_attr_values ADD CONSTRAINT chk_category_attr_values_source
    CHECK (source IN ('PLATFORM', 'SELLER'));
ALTER TABLE cms.banners ADD CONSTRAINT chk_banners_status
    CHECK (status IN ('DISABLED', 'ENABLED'));
ALTER TABLE cms.nav_entries ADD CONSTRAINT chk_nav_entries_status
    CHECK (status IN ('DISABLED', 'ENABLED'));
ALTER TABLE cms.recommend_tabs ADD CONSTRAINT chk_recommend_tabs_status
    CHECK (status IN ('DISABLED', 'ENABLED'));
