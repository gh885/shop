-- V30: Product 模块 — 存量规格数据 ID 化 backfill（best-effort，dev/测试库数据量小）
--
-- 做的事：
--   1. 遍历 specs 非空的商品：按 (类目, 规格名) 建/取 category_attrs（kind=1 销售属性），
--      按值建/取 category_attr_values，products.specs 重写为 {attrId, name, values:[{valueId, value}]} 新形状；
--   2. skus.attributes 按 name+value 映射补 attrId/valueId，并按模板维度顺序生成 spec_key（':' join）。
-- 不做的事：products.params 不迁移（无模板期数据，attrId 留空）；specs='[]' 的商品 SKU spec_key 已是默认 ''，不动。

DO $$
DECLARE
    p            RECORD;
    sku_rec      RECORD;
    dim          RECORD;
    dim_val      RECORD;
    attr_el      JSONB;
    v_attr_id    UUID;
    v_value_id   UUID;
    v_new_specs  JSONB;
    v_new_values JSONB;
    v_new_attrs  JSONB;
    v_dim_ids    UUID[];
    v_dim_names  TEXT[];
    v_key_parts  TEXT[];
    i            INT;
BEGIN
    FOR p IN SELECT id, category_id, specs FROM product.products WHERE specs <> '[]'::jsonb LOOP
        -- 幂等守卫：已是新形状（带 attrId）的跳过
        CONTINUE WHEN p.specs->0 ? 'attrId';

        v_new_specs := '[]'::jsonb;
        v_dim_ids := ARRAY[]::UUID[];
        v_dim_names := ARRAY[]::TEXT[];

        -- 1. 逐规格维度：建/取模板属性与值域，重写 specs JSONB
        FOR dim IN SELECT value FROM jsonb_array_elements(p.specs) LOOP
            INSERT INTO product.category_attrs (category_id, name, kind, allow_custom)
            VALUES (p.category_id, dim.value->>'name', 1, true)
            ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id INTO v_attr_id;

            v_dim_ids := v_dim_ids || v_attr_id;
            v_dim_names := v_dim_names || (dim.value->>'name');

            v_new_values := '[]'::jsonb;
            FOR dim_val IN SELECT value FROM jsonb_array_elements_text(dim.value->'values') LOOP
                INSERT INTO product.category_attr_values (attr_id, value)
                VALUES (v_attr_id, dim_val.value)
                ON CONFLICT (attr_id, value) DO UPDATE SET value = EXCLUDED.value
                RETURNING id INTO v_value_id;
                v_new_values := v_new_values || jsonb_build_object('valueId', v_value_id, 'value', dim_val.value);
            END LOOP;

            v_new_specs := v_new_specs || jsonb_build_object(
                    'attrId', v_attr_id, 'name', dim.value->>'name', 'values', v_new_values);
        END LOOP;

        UPDATE product.products SET specs = v_new_specs WHERE id = p.id;

        -- 2. 逐 SKU：attributes 补身份字段，spec_key 按模板维度序 join（identity 列，改名不变）
        FOR sku_rec IN SELECT id, attributes FROM product.skus WHERE product_id = p.id LOOP
            v_new_attrs := '[]'::jsonb;
            v_key_parts := ARRAY[]::TEXT[];

            FOR i IN 1..COALESCE(array_length(v_dim_ids, 1), 0) LOOP
                SELECT e INTO attr_el FROM jsonb_array_elements(sku_rec.attributes) AS e
                WHERE e->>'name' = v_dim_names[i];
                IF attr_el IS NULL THEN
                    RAISE WARNING 'sku % attributes 缺维度 %，该维度跳过', sku_rec.id, v_dim_names[i];
                    CONTINUE;
                END IF;

                SELECT id INTO v_value_id FROM product.category_attr_values
                WHERE attr_id = v_dim_ids[i] AND value = attr_el->>'value';
                IF v_value_id IS NULL THEN
                    -- 存量 SKU 引用了模板外的取值：补建档，保证映射闭合
                    INSERT INTO product.category_attr_values (attr_id, value)
                    VALUES (v_dim_ids[i], attr_el->>'value')
                    ON CONFLICT (attr_id, value) DO UPDATE SET value = EXCLUDED.value
                    RETURNING id INTO v_value_id;
                END IF;

                v_new_attrs := v_new_attrs || jsonb_build_object(
                        'attrId', v_dim_ids[i], 'valueId', v_value_id,
                        'name', v_dim_names[i], 'value', attr_el->>'value');
                v_key_parts := v_key_parts || v_value_id::text;
            END LOOP;

            UPDATE product.skus
            SET attributes = v_new_attrs, spec_key = array_to_string(v_key_parts, ':')
            WHERE id = sku_rec.id;
        END LOOP;
    END LOOP;
END $$;

-- 防御：backfill 后仍有同 (product_id, spec_key) 重复的行（历史脏数据，如无规格商品意外挂了多个 spec_key='' 的 SKU），
-- 置为 id::text 占位保住唯一性——这些行的身份本来就不可对账，占位不劣化语义
UPDATE product.skus a
SET spec_key = 'legacy:' || a.id::text
WHERE EXISTS (
    SELECT 1 FROM product.skus b
    WHERE b.product_id = a.product_id AND b.spec_key = a.spec_key AND b.id < a.id
);

-- backfill 完成、重复已清，spec_key 唯一索引此时才安全
CREATE UNIQUE INDEX IF NOT EXISTS uk_skus_product_spec_key ON product.skus(product_id, spec_key);
