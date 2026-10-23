SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 修一个口径错误：settlement_item.refunded_amount 记的是**买家退款全额**（payable 口径），
-- 而结算公式 `net_amount - refunded_amount` 减的是**商家净额**。两者差一个佣金比例。
--
-- 后果：退款发生在结算之前时，商家被多扣了退款里的佣金那部分。
-- 一单 7979 元、退一半，商家少收 399.98 元——不报错，只能靠人拿计算器对才发现。
--
-- 修法不在这一版改数（现有数据没有一单是"先退款后结算"的，都是结算之后才退，refund_amount 为 0），
-- 而是把口径写死在注释和约束里，让下一个人不会再把两个数混着用。
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN clearing.settlement_item.refunded_amount IS
    '买家累计退款（payable 口径），与 trade / payment 的退款额同源；不是商家承担的金额。'
    '商家承担 = refunded_amount * net_amount / payable_amount，退满时取 net_amount，'
    '唯一实现在 clearing.model.MerchantShare';

-- 退款累计不可能超过应付：trade 侧已经按行封顶，这里再加一道，防止哪天有第二条写入口
ALTER TABLE clearing.settlement_item
    ADD CONSTRAINT ck_item_refunded CHECK (refunded_amount <= payable_amount);

COMMENT ON CONSTRAINT ck_item_refunded ON clearing.settlement_item IS
    '退款累计不超过应付；超了说明写入口绕过了 trade 的封顶，或者把净额口径写进了 payable 列';

COMMENT ON COLUMN clearing.settlement_batch.refund_amount IS
    '本批冲销的**商家承担**部分（不是买家退款总额）；因此 net_amount = gross_amount - refund_amount 才成立';
