SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 属性值字典：值有稳定 id、排序、图片、来源，商家可在 allow_custom 时追加。
--
-- 值文本创建后不改名：spec_key / identity_key 用的就是文本，改名等于换身份。
-- 要换值：停用旧值、新建新值，存量商品继续用旧值（复验认全部值，不认 active）。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE catalog.attribute_value
(
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    attribute_id uuid        NOT NULL,
    value        text        NOT NULL,
    image_url    text,
    sort         integer     NOT NULL DEFAULT 0,
    source       text        NOT NULL DEFAULT 'platform',
    status       text        NOT NULL DEFAULT 'active',
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_attribute_value_value CHECK (length(btrim(value)) > 0),
    CONSTRAINT ck_attribute_value_source CHECK (source IN ('platform', 'seller')),
    CONSTRAINT ck_attribute_value_status CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX uq_attribute_value ON catalog.attribute_value (attribute_id, lower(value));
CREATE INDEX idx_attribute_value_sort ON catalog.attribute_value (attribute_id, status, sort);

ALTER TABLE catalog.attribute
    ADD COLUMN allow_custom boolean NOT NULL DEFAULT false;

-- 把旧的 options JSON 数组灌进新表，再删旧列。
-- 已经上线的库不会丢值域；测试库/空库这一段就是空操作。
INSERT INTO catalog.attribute_value (attribute_id, value, sort)
SELECT a.id, v.value, (v.ord - 1)::integer
  FROM catalog.attribute a
 CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.options, '[]'::jsonb)) WITH ORDINALITY AS v(value, ord)
ON CONFLICT DO NOTHING;

ALTER TABLE catalog.attribute DROP CONSTRAINT ck_attribute_enum_options;
ALTER TABLE catalog.attribute DROP COLUMN options;
