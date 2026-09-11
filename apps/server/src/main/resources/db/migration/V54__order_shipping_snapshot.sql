-- V54: 订单补两列运费计费快照 —— 金额之外，把「按哪份模板、哪个地区收的」也留在单上
--
-- 动机：shipping_fee 只回答「收了多少」，回答不了「凭什么收这么多」。模板是可编辑的，事后把模板改掉，
-- 历史订单的运费就再也解释不清（淘宝的运费争议里这正是要翻的证据）。两列成本极低，事后补要重算全部历史。
--
--   * shipping_template_id：下单时生效的模板，模板删了/改了不影响追溯（不加 FK，跨 schema 裸引用风格）
--   * receiver_region_code：计费依据的收货区划码。收货快照里只有省市县名字，名字匹配不可靠（同音/简称/重名），
--     国标码才是计费时真正比对的键 —— 存名字不解决问题的那个键
--
-- 未配置模板的店铺两列皆为 NULL，语义 = 没走计费（恒包邮）。

ALTER TABLE orders.orders
    ADD COLUMN IF NOT EXISTS shipping_template_id  UUID,
    ADD COLUMN IF NOT EXISTS receiver_region_code  VARCHAR(12);
