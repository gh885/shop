SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE TABLE catalog.spu
(
    id                  uuid PRIMARY KEY DEFAULT uuidv7(),
    spu_type            text    NOT NULL DEFAULT 'merchant',
    merchant_id         uuid,
    category_id         uuid    NOT NULL,
    brand_id            uuid,
    model_no            text,
    identity_kind       text    NOT NULL DEFAULT 'none',
    match_key           text,
    standard_spu_id     uuid,
    standard_matched_by text,
    title               text    NOT NULL,
    images              jsonb   NOT NULL DEFAULT '[]',
    status              text    NOT NULL DEFAULT 'draft',

    CONSTRAINT ck_spu_type CHECK (spu_type IN ('merchant', 'standard')),
    CONSTRAINT ck_spu_identity CHECK (identity_kind IN ('model_no', 'article_no', 'param_hash', 'none')),
    CONSTRAINT ck_spu_status CHECK (status IN ('draft', 'active', 'offline')),
    CONSTRAINT ck_spu_matched CHECK (
        standard_matched_by IS NULL
        OR standard_matched_by IN ('model_no', 'article_no', 'param_hash', 'manual')
    )
);

CREATE INDEX idx_spu_merchant ON catalog.spu (merchant_id, status);
CREATE INDEX idx_spu_category ON catalog.spu (category_id, status);
CREATE INDEX idx_spu_standard ON catalog.spu (standard_spu_id);

CREATE UNIQUE INDEX uq_spu_standard_match
    ON catalog.spu (identity_kind, match_key)
    WHERE spu_type = 'standard';

CREATE TABLE catalog.spu_attr
(
    spu_id       uuid     NOT NULL,
    attribute_id uuid     NOT NULL,
    value_index  smallint NOT NULL DEFAULT 0,
    value_text   text,
    value_num    numeric,
    value_bool   boolean,

    PRIMARY KEY (spu_id, attribute_id, value_index)
);

CREATE INDEX idx_spu_attr_value ON catalog.spu_attr (attribute_id, value_text);

CREATE TABLE catalog.spu_media
(
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    spu_id       uuid    NOT NULL,
    attribute_id uuid,
    spec_value   text,
    url          text    NOT NULL,
    media_type   text    NOT NULL DEFAULT 'image',
    sort         integer NOT NULL DEFAULT 0,

    CONSTRAINT ck_spu_media_type CHECK (media_type IN ('image', 'video'))
);

CREATE INDEX idx_spu_media ON catalog.spu_media (spu_id, attribute_id, spec_value);

CREATE TABLE catalog.sku
(
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    spu_id         uuid    NOT NULL,
    spec_values    jsonb   NOT NULL,
    spec_key       text    NOT NULL,
    barcode        text,
    identity_key   text,
    price_amount   bigint  NOT NULL,
    price_currency char(3) NOT NULL DEFAULT 'CNY',
    weight_g       integer,
    status         text    NOT NULL DEFAULT 'active',

    CONSTRAINT uq_sku_spec UNIQUE (spu_id, spec_key),
    CONSTRAINT ck_sku_price CHECK (price_amount >= 0),
    CONSTRAINT ck_sku_weight CHECK (weight_g IS NULL OR weight_g > 0),
    CONSTRAINT ck_sku_status CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX idx_sku_identity ON catalog.sku (identity_key);
