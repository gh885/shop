-- V7: Product 模块 — skus 商品变体(SKU)表

CREATE TABLE IF NOT EXISTS product.skus (
    id             UUID PRIMARY KEY DEFAULT uuidv7(),
    product_id     UUID NOT NULL,
    sku_code       VARCHAR(64),                     -- 业务编码，仓管/外部系统对账用
    name           VARCHAR(160) NOT NULL,           -- SPU 名 + 规格值拼接，历史订单快照
    attributes     JSONB NOT NULL DEFAULT '[]',     -- 规格取值 [{"name":"颜色","value":"黑"}]
    image          VARCHAR(255),
    price          BIGINT,                          -- 成交价（分）；草稿期 SKU 建后为 NULL，发布前必须全部设价
    original_price BIGINT,                          -- 划线价（分），可空
    currency       VARCHAR(3) NOT NULL DEFAULT 'CNY',
    stock          INT NOT NULL DEFAULT 0,
    status         SMALLINT NOT NULL DEFAULT 1,     -- 1 在售 / 0 停用
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同一商品不允许重复规格组合；左前缀 product_id 同时覆盖「查某商品所有 SKU」，无需额外单列索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_skus_product_attrs ON product.skus(product_id, attributes);

-- SKU 业务编码全局唯一（NULL 不冲突）
CREATE UNIQUE INDEX IF NOT EXISTS uk_skus_code ON product.skus(sku_code);
