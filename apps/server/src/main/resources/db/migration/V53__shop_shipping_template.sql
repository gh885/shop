-- V53: 运费模板 —— 按收货地区与件数计费（模板是店铺的履约承诺，故与商家地址同居 shop schema）
--
-- 对齐淘宝运费模板的语义，但只留我们需要的那一维：
--   * 淘宝一个模板挂 4 套运送方式（快递/EMS/平邮/COD），每种方式各自一整套区域规则 —— 那是早年渠道
--     定价不同的历史包袱。我们的承运商已归一成 logistics.carriers 字典，国内快递没有渠道定价差异，
--     照搬等于 4 倍的表和 4 倍的 UI，收益为零；需要时再加 channel 列。
--   * 淘宝的计价方式有按件/按重量/按体积三种，这里只做<b>按件</b>：按重量要求 product.skus 有重量列
--     且卖家逐 SKU 填，是独立的一条数据线，等大件类目出现再做。列名把单位写进名字（first_quantity
--     而非 first_standard），这样「口径是按件」不靠注释维系；加按重量时新增 valuation 列 + 重量列。
--   * 淘宝的区域规则靠编辑界面阻止重叠，数据模型本身表达不了「广东省包邮但新疆不包邮」。这里区域
--     存<b>国标区划码前缀</b>（省 2 位 / 市 4 位 / 区县 6 位），匹配 = 收货区码 startsWith 前缀，
--     最长前缀胜 —— 「指定地区优先于默认」与「更细粒度优先」由同一套规则给出，不需要成员表。
--
-- 三张表的关系：模板（合同）→ 计费规则（含唯一一条默认规则 + N 条指定地区规则）→ 规则覆盖的区域前缀；
-- 外加一张不配送地区表 —— 它与运费无关，是「送不到」，命中即拒绝下单，故不做成 first_fee=0 的规则：
-- 让费用列在数据里说谎比多一张表贵。

CREATE TABLE IF NOT EXISTS shop.shipping_templates (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    shop_id            UUID NOT NULL,                  -- 归属店铺，shop.shops.id，跨 schema 裸引用不加 FK
    free_shipping      BOOLEAN NOT NULL DEFAULT FALSE,  -- 卖家承担运费（对齐淘宝 assumer=1）：不看地区与件数
    free_over_quantity INT CHECK (free_over_quantity IS NULL OR free_over_quantity >= 1),  -- 满件包邮门槛（件）
    free_over_amount   BIGINT CHECK (free_over_amount IS NULL OR free_over_amount >= 0),   -- 满额包邮门槛（分）
    deleted_at         TIMESTAMPTZ,                     -- 软删标记，NULL=生效
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每店至多一个生效模板：商品级绑定还没做（商品挑模板见将来的 product.shipping_template_id），
-- 在此之前多模板没有消费方，允许多个只会让「订单按哪个模板算」变成歧义。
CREATE UNIQUE INDEX IF NOT EXISTS uk_shipping_templates_shop
    ON shop.shipping_templates(shop_id) WHERE deleted_at IS NULL;

-- 计费规则：首件价 + 续件价（不足一档按一档）。is_default 的那条是兜底，区域未命中任何指定地区规则时用它。
CREATE TABLE IF NOT EXISTS shop.shipping_rules (
    id             UUID PRIMARY KEY DEFAULT uuidv7(),
    template_id    UUID NOT NULL,                       -- shop.shipping_templates.id
    is_default     BOOLEAN NOT NULL DEFAULT FALSE,      -- 默认规则（淘宝：默认运费必填，一个不动点）
    first_quantity INT NOT NULL CHECK (first_quantity >= 1),   -- 首件标准（件）
    first_fee      BIGINT NOT NULL CHECK (first_fee >= 0),     -- 首费（分）
    add_quantity   INT NOT NULL CHECK (add_quantity >= 1),     -- 续件标准（件）
    add_fee        BIGINT NOT NULL CHECK (add_fee >= 0),       -- 续费（分）
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一个模板至多一条默认规则（并发写由唯一索引兜底，应用层抓冲突转 409/400）
CREATE UNIQUE INDEX IF NOT EXISTS uk_shipping_rules_default
    ON shop.shipping_rules(template_id) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_shipping_rules_template ON shop.shipping_rules(template_id);

-- 规则覆盖的区域前缀：一条规则可勾多个省/市/区，故拆子表（对齐淘宝「一条规则含多个地区」）
CREATE TABLE IF NOT EXISTS shop.shipping_rule_regions (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    rule_id       UUID NOT NULL,                        -- shop.shipping_rules.id
    region_prefix VARCHAR(6) NOT NULL,                  -- 国标区划码前缀：2 位省 / 4 位市 / 6 位区县
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_shipping_rule_regions
    ON shop.shipping_rule_regions(rule_id, region_prefix);

-- 不配送地区（对齐淘宝「不配送地区」而非「不包邮地区」）：买家下不了单，与偏远地区加价是两回事
CREATE TABLE IF NOT EXISTS shop.shipping_exclusions (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    template_id   UUID NOT NULL,                        -- shop.shipping_templates.id
    region_prefix VARCHAR(6) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_shipping_exclusions
    ON shop.shipping_exclusions(template_id, region_prefix);
