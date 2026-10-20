-- V89: 平台标准品 —— 跨商家识别「同一个东西」的那一层
--
-- 为什么要有它：Marketplace 与自营的核心差别是「平台能不能聚合」。没有标准品，平台只能把各家的
-- listing 罗列出来，做不了跨店比价、搜索归一、类目运营——那只是「多商家」，不是「平台」。
-- 但标准品本身是重活（匹配、归一、人工审核），数据质量天然不完美，所以它**不进在线交易链路**：
-- 下单、库存、发货只认商家自己的 SPU/SKU，标准品只做聚合视角。这条边界是这张表存在的全部理由。
--
-- 三层模型：
--   product.standard_products   平台标准品（归一后的「同一个东西」），挂类目，无价格无库存
--   product.products            商家商品（listing），归属一个商家，可空挂一个标准品
--   product.skus                商家 SKU，真正可售的单元
--
-- 关系为什么是「多对一 + 可空」而不是多对多：
--   * 多对多会让「这个商品属于哪个标准品」变成不可判定，搜索聚合立刻出现重复计数与归属争议；
--   * 可空是因为长尾商家不可能预先穷举匹配——挂不上就先不参与聚合，但不能挡住他卖货。
--   * 不设 FK（跨表同 schema 也不设）：本仓库的跨表引用一贯裸引用，见 orders.orders.shop_id 等先例。
--
-- 匹配方式本期只做「卖家自助挂靠 + 平台可改」，不做自动匹配任务：自动匹配需要条码库或 NLP，
-- 那是另一块独立的活；而人工挂靠的置信度天然最高，先把它跑通比先上算法更有用。
--
-- 本文件只放普通 DDL：CONCURRENTLY 不能跑在事务里，与普通语句混写会触发 Flyway 的 mixed 检查
-- （见 V77 头部），所以三条索引单独住在 V90。

SET lock_timeout = '3s';

SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS product.standard_products (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    category_id UUID NOT NULL,                      -- 归一后的归属类目（product.categories.id）
    name        VARCHAR(128) NOT NULL,              -- 标准名（如「iPhone 15 Pro 256G 黑色」），平台维护
    brand       VARCHAR(64),                        -- 品牌，可空（长尾白牌没有品牌）
    barcode     VARCHAR(64),                        -- 条码（EAN/UPC），可空；有它就是最硬的匹配依据
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'MERGED')),  -- MERGED = 被合并进另一个标准品（错匹配的收口）
    merged_into UUID,                               -- 合并去向（status=MERGED 时非空），裸引用本表 id
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 合并态与去向同空同非空：只写一半就是一条查不到归属的脏行
    CONSTRAINT ck_standard_products_merged CHECK ((status = 'MERGED') = (merged_into IS NOT NULL))
);

COMMENT ON TABLE product.standard_products IS '平台标准品：跨商家识别同一商品用，不进在线交易链路（不参与下单/库存/发货判定）';
COMMENT ON COLUMN product.standard_products.status IS 'ACTIVE 可用 / MERGED 已并入 merged_into（错匹配的收口，不物理删）';

-- 商家商品挂靠：可空外键（裸引用）。不设 FK 与全仓库口径一致；挂靠错了由平台改，不影响交易数据
ALTER TABLE product.products ADD COLUMN IF NOT EXISTS standard_product_id UUID;

COMMENT ON COLUMN product.products.standard_product_id IS '挂靠的平台标准品（product.standard_products.id），可空 = 未匹配；仅聚合视角用，交易链路不读它';
