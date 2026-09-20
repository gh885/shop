-- V58: Money 的落库口径补齐 —— 存金额的行各自带币种，并把「一期只有 CNY」钉成 DB 约束
--
-- 背景：全链路金额统一走 Money（amount + currency）。库里仍按列存（分 + 币种列），由实体派生出 Money。
-- 此前的缺口有三类：
--   * product.products / shop.shipping_templates / shop.shipping_rules 只有金额列没有币种列，代码里只好去借
--     ——运费报价借订单的币种、建券硬编码 CNY。金额脱离自己的币种就成了裸数字，注释说它是谁的就是谁的。
--   * 已有的 currency 列没有任何约束，写 'USD' 也存得下，Money 的跨币种护栏在库这一侧等于不存在。
--   * product 的四列价格连非负都没约束（负价写得进，只有抛异常的那一次读会暴露）。
--
-- 币种按「行」存而不是「随父行」：orders.items 早已如此（一行一份币种）。子行继承父行币种要 JOIN 才说得出口，
-- 而派生视图就该在自己那一行上闭合。冗余的代价由 DEFAULT 'CNY' 与下面的 CHECK 一起付——全库只认一个币种，
-- 父子行不可能不一致到看不出来。
--
-- CHECK (currency = 'CNY') 不是将来忘了删的陷阱，恰恰相反：真做多币种时这里每一条都要被显式数一遍，
-- 比让 USD 静默混进 CNY 的列便宜得多。

-- ---- 补币种列（存量行由 DEFAULT 落为 CNY）----

ALTER TABLE product.products
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'CNY';

ALTER TABLE shop.shipping_templates
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'CNY';

ALTER TABLE shop.shipping_rules
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'CNY';

-- ---- 币种闸门：金额行只认平台定价币种 ----

ALTER TABLE product.products          ADD CONSTRAINT ck_products_currency          CHECK (currency = 'CNY');
ALTER TABLE product.skus              ADD CONSTRAINT ck_skus_currency              CHECK (currency = 'CNY');
ALTER TABLE shop.shipping_templates   ADD CONSTRAINT ck_shipping_templates_currency CHECK (currency = 'CNY');
ALTER TABLE shop.shipping_rules       ADD CONSTRAINT ck_shipping_rules_currency     CHECK (currency = 'CNY');
ALTER TABLE orders.orders             ADD CONSTRAINT ck_orders_currency             CHECK (currency = 'CNY');
ALTER TABLE orders.items              ADD CONSTRAINT ck_order_items_currency        CHECK (currency = 'CNY');
ALTER TABLE payment.payments          ADD CONSTRAINT ck_payments_currency           CHECK (currency = 'CNY');
ALTER TABLE aftersale.tickets         ADD CONSTRAINT ck_tickets_currency            CHECK (currency = 'CNY');
ALTER TABLE coupon.coupon_templates   ADD CONSTRAINT ck_coupon_templates_currency   CHECK (currency = 'CNY');
ALTER TABLE coupon.user_coupons       ADD CONSTRAINT ck_user_coupons_currency       CHECK (currency = 'CNY');
ALTER TABLE coupon.coupon_usages      ADD CONSTRAINT ck_coupon_usages_currency      CHECK (currency = 'CNY');

-- ---- 非负闸门：Money 的「交易金额不为负」在库这一侧同样成立 ----

-- 草稿期 SKU 未定价（price 可为 NULL），故约束只管「有值就不能为负」
ALTER TABLE product.skus
    ADD CONSTRAINT ck_skus_price CHECK (price IS NULL OR price >= 0),
    ADD CONSTRAINT ck_skus_original_price CHECK (original_price IS NULL OR original_price >= 0);

ALTER TABLE product.products
    ADD CONSTRAINT ck_products_min_price CHECK (min_price IS NULL OR min_price >= 0),
    ADD CONSTRAINT ck_products_max_price CHECK (max_price IS NULL OR max_price >= 0),
    -- 价格区间自己不能矛盾：两端都有值时低的高不过高的（「¥299 起」与排序都读它）
    ADD CONSTRAINT ck_products_price_range CHECK (min_price IS NULL OR max_price IS NULL OR min_price <= max_price);

ALTER TABLE orders.orders
    ADD CONSTRAINT ck_orders_refund_amount CHECK (refund_amount IS NULL OR refund_amount >= 0);
