SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 算价：运费模板 + 报价单 + 逐行结果 + 规则证据 + 每商家运费。
--
-- 形状与不变量见 docs/domain/pricing.md。三条硬约束在这里落地：
--   1. 运费模板一个店同时只能有一个 active（否则同一单两套运费）
--   2. 行金额能对平：payable = subtotal - discount_amount，且非负
--   3. 报价单总和能对平：goods - discount + shipping = payable
--
-- 分摊之和等于优惠总额这条跨不出 jsonb，只能事后核对，不假装它已被防住。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS pricing;

COMMENT ON SCHEMA pricing IS '算价：五层流水线 + 报价单证据；规则数据不在这里，归 promotion';

-- 运费模板：唯一住在 pricing 的规则
CREATE TABLE pricing.shipping_template
(
    id        uuid PRIMARY KEY DEFAULT uuidv7(),
    shop_id   uuid        NOT NULL,
    name      text        NOT NULL,
    charge_by text        NOT NULL,
    free_over bigint,
    regions   jsonb       NOT NULL,
    status    text        NOT NULL DEFAULT 'active',

    CONSTRAINT ck_shipping_charge_by CHECK (charge_by IN ('weight', 'piece')),
    CONSTRAINT ck_shipping_status CHECK (status IN ('active', 'archived')),
    CONSTRAINT ck_shipping_free_over CHECK (free_over IS NULL OR free_over >= 0)
);

COMMENT ON TABLE pricing.shipping_template IS '运费模板；"满 99 包邮"要看折后金额，所以只有算价知道门槛过不过';
COMMENT ON COLUMN pricing.shipping_template.regions IS 'jsonb [{areaCodes, first, firstFee, additional, additionalFee}]；必须有 areaCodes: [] 的默认项';

-- 一个店同时只能有一个启用模板，否则同一单会出现两套运费
CREATE UNIQUE INDEX uq_shipping_template_active
    ON pricing.shipping_template (shop_id)
    WHERE status = 'active';

CREATE TABLE pricing.price_quote
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    buyer_id        uuid        NOT NULL,
    status          text        NOT NULL DEFAULT 'issued',
    fingerprint     text        NOT NULL,
    ship_address    jsonb       NOT NULL,
    entitlements    jsonb       NOT NULL DEFAULT '[]',
    currency        char(3)     NOT NULL DEFAULT 'CNY',
    goods_amount    bigint      NOT NULL,
    discount_amount bigint      NOT NULL,
    shipping_amount bigint      NOT NULL,
    payable_amount  bigint      NOT NULL,
    rule_ids        uuid[]      NOT NULL DEFAULT '{}',
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_quote_sum CHECK (
        goods_amount - discount_amount + shipping_amount = payable_amount),
    CONSTRAINT ck_quote_status CHECK (status IN ('issued', 'used', 'expired')),
    CONSTRAINT ck_quote_nonneg CHECK (
        goods_amount >= 0 AND discount_amount >= 0 AND shipping_amount >= 0 AND payable_amount >= 0)
);

COMMENT ON TABLE pricing.price_quote IS '一次算价的完整结果，也是证据；一张只能被用一次';
COMMENT ON COLUMN pricing.price_quote.fingerprint IS '规范化输入的 SHA-256；落单时比对，不一致返回 PRICE_CHANGED';
COMMENT ON COLUMN pricing.price_quote.ship_address IS '算价时的地址必须落库：只存结果不存输入，投诉"运费为什么是 12 块"还是查不清';
COMMENT ON COLUMN pricing.price_quote.rule_ids IS '命中的规则，按执行顺序；重算时能对上是哪一版';

CREATE INDEX idx_price_quote_buyer ON pricing.price_quote (buyer_id, created_at);

CREATE TABLE pricing.price_quote_line
(
    quote_id        uuid    NOT NULL,
    line_no         integer NOT NULL,
    offer_id        uuid    NOT NULL,
    sku_id          uuid    NOT NULL,
    merchant_id     uuid    NOT NULL,
    shop_id         uuid    NOT NULL,
    quantity        integer NOT NULL,
    unit_amount     bigint  NOT NULL,
    weight_g        integer,
    subtotal        bigint  NOT NULL,
    discount_amount bigint  NOT NULL,
    payable         bigint  NOT NULL,

    -- 商品快照：订单行要存"下单时是什么"，所以算价就得把它钉在报价单里。
    -- trade 不许回头查 catalog——那既是竞态，也让订单金额和商品状态脱钩。
    spu_id          uuid    NOT NULL,
    category_id     uuid    NOT NULL,
    brand_id        uuid,
    title           text    NOT NULL,
    image_url       text,
    spec_values     jsonb   NOT NULL DEFAULT '{}',
    identity_key    text,

    CONSTRAINT pk_quote_line PRIMARY KEY (quote_id, line_no),
    CONSTRAINT ck_line_qty CHECK (quantity > 0),
    CONSTRAINT ck_line_sub CHECK (subtotal = unit_amount * quantity),
    CONSTRAINT ck_line_disc CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
    -- 硬护栏：任何算法漏洞都不允许把行刷成负金额
    CONSTRAINT ck_line_payable CHECK (payable = subtotal - discount_amount AND payable >= 0)
);

COMMENT ON TABLE pricing.price_quote_line IS '行结果 + 商品快照；payable 不含运费，运费按店铺单独成行';
COMMENT ON COLUMN pricing.price_quote_line.weight_g IS 'SKU 重量快照，按重量计费的证据';
COMMENT ON COLUMN pricing.price_quote_line.shop_id IS
    '挂售店铺。运费模板按店铺算，落单时子单也需要它；不存这里就得回头问 catalog，那是竞态';
COMMENT ON COLUMN pricing.price_quote_line.title IS '商品标题快照；商品改名后订单页还要能显示原名';

CREATE TABLE pricing.price_quote_rule
(
    quote_id         uuid    NOT NULL,
    rule_id          uuid    NOT NULL,
    rule_version     text    NOT NULL,
    type             text    NOT NULL,
    scope            text    NOT NULL,
    bearer           text    NOT NULL,
    outcome          text    NOT NULL,
    base_amount      bigint  NOT NULL,
    threshold        bigint,
    requested_amount bigint,
    amount           bigint  NOT NULL,
    allocation       jsonb,

    CONSTRAINT pk_quote_rule PRIMARY KEY (quote_id, rule_id),
    CONSTRAINT ck_rule_outcome CHECK (outcome IN ('applied', 'skipped', 'truncated')),
    CONSTRAINT ck_rule_scope CHECK (scope IN ('line', 'seller_order', 'order_group')),
    CONSTRAINT ck_rule_bearer CHECK (bearer IN ('platform', 'merchant')),
    CONSTRAINT ck_rule_amount CHECK (amount >= 0)
);

COMMENT ON TABLE pricing.price_quote_rule IS '每一条被评估过的规则，命中的和没命中的都记；只记命中的，投诉"为什么没给我打折"时永远查不清';
COMMENT ON COLUMN pricing.price_quote_rule.requested_amount IS '规则想减多少；与 amount 不等就是被基数截断了';
COMMENT ON COLUMN pricing.price_quote_rule.allocation IS 'jsonb {"1": 300, "2": 200}；整体证据，从不单独查询，拆表只是多一次 join';

CREATE TABLE pricing.price_quote_shipping
(
    quote_id        uuid    NOT NULL,
    merchant_id     uuid    NOT NULL,
    template_id     uuid    NOT NULL,
    charge_by       text    NOT NULL,
    weight_g        bigint,
    shipping_amount bigint  NOT NULL,
    free_applied    boolean NOT NULL DEFAULT false,

    CONSTRAINT pk_quote_shipping PRIMARY KEY (quote_id, merchant_id),
    CONSTRAINT ck_quote_shipping CHECK (
        shipping_amount >= 0 AND (weight_g IS NULL OR weight_g >= 0)),
    CONSTRAINT ck_quote_charge_by CHECK (charge_by IN ('weight', 'piece'))
);

COMMENT ON TABLE pricing.price_quote_shipping IS '运费按商家算，不按整单算；每个店有自己的模板和包邮门槛';
