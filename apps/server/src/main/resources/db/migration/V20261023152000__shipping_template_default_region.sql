SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 运费模板必须有默认地区项。
--
-- pricing.md 写着"没有默认项就拒绝启用模板"，但那条规则此前只活在文档里：本地手造的模板
-- 可以带一个空 regions 落库，直到算价时才在 feeFor 里抛异常——报出来是 500，用户看到的是
-- "服务器内部错误"，而不是"这个店运费没配好"。
--
-- 修法是把规则变成库约束。先补历史坏数据（空 regions 的模板本来就发不出货），再加 CHECK。
-- ─────────────────────────────────────────────────────────────────────────────

-- 首件 12 元、续件 5 元；areaCodes 为空表示"所有地区都没单独命中时用它"
UPDATE pricing.shipping_template
   SET regions = '[{"areaCodes": [], "first": 1, "firstFee": 1200, "additional": 1, "additionalFee": 500}]'::jsonb
 WHERE NOT jsonb_path_exists(regions, '$[*] ? (@.areaCodes.size() == 0)');

ALTER TABLE pricing.shipping_template
    ADD CONSTRAINT ck_shipping_default_region
        CHECK (jsonb_path_exists(regions, '$[*] ? (@.areaCodes.size() == 0)'));

COMMENT ON CONSTRAINT ck_shipping_default_region ON pricing.shipping_template IS
    '必须有一条 areaCodes: [] 的默认项；没有它，任何没单独配过的地区都算不出运费';
