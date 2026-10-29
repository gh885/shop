SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 商品数据模型补齐：副标题、七天无理由、销量、划线价、商家 SKU 编码
-- 全部是「只增」动作；不建外键，归属一致性用触发器兜底。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE catalog.spu
    ADD COLUMN subtitle        text,
    ADD COLUMN seven_day_return boolean NOT NULL DEFAULT true,
    ADD COLUMN sold_count      bigint  NOT NULL DEFAULT 0;

ALTER TABLE catalog.spu
    ADD CONSTRAINT ck_spu_subtitle_len CHECK (subtitle IS NULL OR char_length(subtitle) <= 200),
    ADD CONSTRAINT ck_spu_sold_count CHECK (sold_count >= 0);

ALTER TABLE catalog.sku
    ADD COLUMN original_price_amount bigint,
    ADD COLUMN merchant_id           uuid,
    ADD COLUMN merchant_code         text;

ALTER TABLE catalog.sku
    ADD CONSTRAINT ck_sku_currency CHECK (price_currency = 'CNY'),
    ADD CONSTRAINT ck_sku_original_price CHECK (
        original_price_amount IS NULL OR original_price_amount >= price_amount
    ),
    ADD CONSTRAINT ck_sku_merchant_code CHECK (merchant_code IS NULL OR char_length(merchant_code) <= 64);

-- 商家编码在商家内唯一。SKU 自身不带 merchant_id，插入时从 SPU 带上；
-- 历史行/测试裸插为 NULL，PostgreSQL 唯一索引允许多个 NULL。
CREATE UNIQUE INDEX uq_sku_merchant_code
    ON catalog.sku (merchant_id, merchant_code)
    WHERE merchant_code IS NOT NULL;

ALTER TABLE catalog.spu_media DROP CONSTRAINT ck_spu_media_type;
ALTER TABLE catalog.spu_media
    ADD CONSTRAINT ck_spu_media_type CHECK (media_type IN ('image', 'video', 'detail'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 读路径索引
-- ─────────────────────────────────────────────────────────────────────────────

-- 买家 feed / 卖家列表都按 (created_at, id) 倒序翻页
CREATE INDEX idx_spu_created
    ON catalog.spu (created_at DESC, id DESC)
    WHERE spu_type = 'merchant';

-- 买家列表 / 详情 / 比价的「有没有在线挂售」反连接
CREATE INDEX idx_listing_online_spu
    ON catalog.listing (spu_id)
    WHERE status = 'online';

-- 封店级联下架：按商家找在线 listing
CREATE INDEX idx_listing_merchant_status
    ON catalog.listing (merchant_id, status);

-- 审核队列按商家筛选
CREATE INDEX idx_listing_merchant_pending
    ON catalog.listing (merchant_id, submitted_at)
    WHERE status = 'pending';

-- 列表卡片的 min(price) 与起价计算
CREATE INDEX idx_sku_spu_price
    ON catalog.sku (spu_id, price_amount)
    WHERE status = 'active';

-- 搜索降级路径的 title / subtitle 包含匹配
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_spu_title_trgm
    ON catalog.spu USING GIN (title gin_trgm_ops)
    WHERE spu_type = 'merchant';
CREATE INDEX idx_spu_subtitle_trgm
    ON catalog.spu USING GIN (subtitle gin_trgm_ops)
    WHERE spu_type = 'merchant';

-- ─────────────────────────────────────────────────────────────────────────────
-- listing 的 merchant_id 必须与 SPU 归属一致。
-- 应用层已经由 submitListing 从 SPU 派生，这条是库层兜底：不跨 schema，只读同 schema 的 spu。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION catalog.assert_listing_merchant() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF NOT EXISTS (SELECT 1
                     FROM catalog.spu s
                    WHERE s.id = NEW.spu_id
                      AND s.merchant_id = NEW.merchant_id) THEN
        RAISE EXCEPTION 'listing.merchant_id 与 spu.merchant_id 不一致: spu=%', NEW.spu_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_listing_merchant_matches_spu
    BEFORE INSERT OR UPDATE OF spu_id, merchant_id ON catalog.listing
    FOR EACH ROW
    EXECUTE FUNCTION catalog.assert_listing_merchant();

-- 七天无理由随下单快照：售后判定的是「下单时承诺了什么」，不是商品现在的值。
ALTER TABLE pricing.price_quote_line
    ADD COLUMN seven_day_return boolean NOT NULL DEFAULT true;
ALTER TABLE trade.order_line
    ADD COLUMN seven_day_return boolean NOT NULL DEFAULT true;
