SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 商品模型第一刀：类目树、属性模板、品牌。
-- 前台类目、类目迁移不在这一刀里，见 docs/domain/product-model.md。
CREATE SCHEMA IF NOT EXISTS catalog;

COMMENT ON SCHEMA catalog IS '商品：类目、属性、品牌、SPU/SKU、售卖关系';

CREATE TABLE catalog.category
(
    id                  uuid PRIMARY KEY DEFAULT uuidv7(),
    parent_id           uuid,
    path                text        NOT NULL,
    level               smallint    NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    is_leaf             boolean     NOT NULL DEFAULT true,
    status              text        NOT NULL DEFAULT 'active',
    auto_approve        boolean     NOT NULL DEFAULT false,
    qualification_codes text[]      NOT NULL DEFAULT '{}',
    identity_keys       text[]      NOT NULL DEFAULT '{none}',
    sku_identity_kinds  text[]      NOT NULL DEFAULT '{none}',
    match_strategies    text[]      NOT NULL DEFAULT '{}',
    brand_policy        text        NOT NULL DEFAULT 'optional',

    CONSTRAINT uq_category_path UNIQUE (path),
    CONSTRAINT uq_category_code UNIQUE (code),
    CONSTRAINT ck_category_level CHECK (level BETWEEN 1 AND 4),
    CONSTRAINT ck_category_status CHECK (status IN ('active', 'frozen', 'closed')),
    CONSTRAINT ck_category_brand_policy CHECK (brand_policy IN ('required', 'optional', 'forbidden'))
);

CREATE INDEX idx_category_parent ON catalog.category (parent_id);
CREATE INDEX idx_category_path_prefix ON catalog.category (path text_pattern_ops);

CREATE TABLE catalog.attribute
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    category_id   uuid        NOT NULL,
    code          text        NOT NULL,
    name          text        NOT NULL,
    value_type    text        NOT NULL,
    options       jsonb,
    is_sales_spec boolean     NOT NULL DEFAULT false,
    is_required   boolean     NOT NULL DEFAULT false,
    is_identity   boolean     NOT NULL DEFAULT false,
    is_filterable boolean     NOT NULL DEFAULT false,
    is_multi      boolean     NOT NULL DEFAULT false,

    CONSTRAINT uq_attribute_code UNIQUE (category_id, code),
    CONSTRAINT ck_attribute_value_type CHECK (value_type IN ('text', 'number', 'enum', 'bool'))
);

CREATE INDEX idx_attribute_category ON catalog.attribute (category_id);

CREATE TABLE catalog.brand
(
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    name       text NOT NULL,
    owner_type text NOT NULL DEFAULT 'platform',
    status     text NOT NULL DEFAULT 'pending',

    CONSTRAINT ck_brand_owner_type CHECK (owner_type IN ('platform', 'merchant')),
    CONSTRAINT ck_brand_status CHECK (status IN ('pending', 'approved', 'rejected'))
);
