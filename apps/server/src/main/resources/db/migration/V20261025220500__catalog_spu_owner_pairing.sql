SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- catalog.spu 补两条配对约束。口径一直在 product-model.md §2，此前只活在文档里：
--   1. merchant SPU 必须归属商家，standard 是平台主数据、merchant_id 恒空——
--      merchant_id 同时是分片键，merchant 行空了分片路由就没了
--   2. standard SPU 是归并的终点，自己不许再挂 standard_spu_id
-- 全库「同生同死」配对是既有风格（close/close_reason、deadline 三列），这两处是漏网。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE catalog.spu
    ADD CONSTRAINT ck_spu_owner CHECK ((spu_type = 'merchant') = (merchant_id IS NOT NULL)),
    ADD CONSTRAINT ck_spu_standard_leaf CHECK (spu_type <> 'standard' OR standard_spu_id IS NULL);
