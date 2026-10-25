SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- catalog 挂售关系 offer → listing。
-- listing 是国际市场places 的标准词（eBay/Amazon listing），且不再与算价语境的
-- 「报价/offer」歧义。表、复核表、跨 schema 的 offer_id 引用列、约束与索引一起改。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE catalog.offer RENAME TO listing;
ALTER TABLE catalog.offer_review RENAME TO listing_review;

ALTER TABLE catalog.listing_review RENAME COLUMN offer_id TO listing_id;
ALTER TABLE pricing.price_quote_line RENAME COLUMN offer_id TO listing_id;
ALTER TABLE trade.order_line RENAME COLUMN offer_id TO listing_id;

ALTER TABLE catalog.listing RENAME CONSTRAINT ck_offer_status TO ck_listing_status;
ALTER TABLE catalog.listing_review RENAME CONSTRAINT uq_offer_review_round TO uq_listing_review_round;
ALTER TABLE catalog.listing_review RENAME CONSTRAINT ck_offer_review_decision TO ck_listing_review_decision;
ALTER INDEX catalog.idx_offer_shop_status RENAME TO idx_listing_shop_status;
ALTER INDEX catalog.idx_offer_pending_submitted RENAME TO idx_listing_pending_submitted;
ALTER INDEX catalog.uq_offer_spu_shop RENAME TO uq_listing_spu_shop;

COMMENT ON TABLE catalog.listing IS '挂售关系（listing）：一个 SPU 在一家店的售卖与审核状态';
COMMENT ON TABLE catalog.listing_review IS '挂售审核轮次；一轮一行';
