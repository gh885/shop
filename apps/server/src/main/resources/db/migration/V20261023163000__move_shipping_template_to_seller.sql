SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 运费模板搬到 seller。
--
-- 它不是算价规则，是**店铺配置**：shop_id 指向的就是 seller 的 shop，一个店一套模板。
-- 之前放在 pricing 是因为"满 99 包邮要看折后金额"——那是**计算**的依赖，不是**数据**的归属。
-- 现在按 promotion 的同一套切法：数据归 seller，pricing 通过 seller :: api 拿 FreightRule 自己算。
--
-- 只搬表，不改结构：索引、约束（含 ck_shipping_default_region）、注释都跟着走。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pricing.shipping_template SET SCHEMA seller;

COMMENT ON TABLE seller.shipping_template IS
    '运费模板：店铺配置，归 seller；金额计算在 pricing（包邮门槛要看折后金额，只有算价知道）';
COMMENT ON COLUMN seller.shipping_template.regions IS
    'jsonb [{areaCodes, first, firstFee, additional, additionalFee}]；必须有 areaCodes: [] 的默认项';
