-- V29: Product 模块 — 类目属性模板（category_attrs / category_attr_values）+ skus.spec_key

-- 类目属性定义：挂在叶子类目（level=3）上，卖家发商品时按模板填规格与参数
CREATE TABLE IF NOT EXISTS product.category_attrs (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    category_id  UUID NOT NULL REFERENCES product.categories(id),
    name         VARCHAR(32) NOT NULL,
    kind         SMALLINT NOT NULL,                 -- 1 销售属性（参与 SKU 生成）/ 2 非销售参数（仅展示）
    required     BOOLEAN NOT NULL DEFAULT false,    -- param 是否必填；spec 恒参与 SKU 生成，该位仅对 param 有意义
    allow_custom BOOLEAN NOT NULL DEFAULT true,     -- 卖家可否扩充值域/自由输入
    sort         INT NOT NULL DEFAULT 0,
    status       SMALLINT NOT NULL DEFAULT 1,       -- 1 启用 / 0 禁用（同 categories 软删语义，不物理删）
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同类目下属性不重名
CREATE UNIQUE INDEX IF NOT EXISTS uk_category_attrs_category_name ON product.category_attrs(category_id, name);

-- 发布页按类目拉模板
CREATE INDEX IF NOT EXISTS idx_category_attrs_category_id ON product.category_attrs(category_id);

-- 属性枚举值域；param 可无值域（纯自由输入）。不挂 status：第一版不支持删值（YAGNI），改名/排序支持
CREATE TABLE IF NOT EXISTS product.category_attr_values (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
    attr_id    UUID NOT NULL REFERENCES product.category_attrs(id),
    value      VARCHAR(64) NOT NULL,
    sort       INT NOT NULL DEFAULT 0,
    source     SMALLINT NOT NULL DEFAULT 1,         -- 1 平台预置 / 2 卖家扩充（提交值域外新值自动建档）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同一属性下值不重名（卖家并发扩充同值时兜底）
CREATE UNIQUE INDEX IF NOT EXISTS uk_category_attr_values_attr_value ON product.category_attr_values(attr_id, value);

-- SKU 身份列：valueId 按模板维度顺序 ':' join；无规格商品为 ''。
-- 规格值改名只动 name/value 快照，spec_key 不变 → SKU 对账保留、价格库存不丢。
-- 注意：此处不能立刻建唯一索引——存量多 SKU 商品的 spec_key 此刻全是默认 ''，必撞。
-- uk_skus_product_spec_key 推迟到 V30 backfill 完成后再建。
ALTER TABLE product.skus ADD COLUMN IF NOT EXISTS spec_key VARCHAR(512) NOT NULL DEFAULT '';

-- JSONB 列整体比较的唯一索引退役（改名即换组合是它的硬伤），身份改由 spec_key 承担
DROP INDEX IF EXISTS product.uk_skus_product_attrs;
