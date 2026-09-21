-- V57: 订单接入优惠券 —— 金额构成加 discount_amount，并把 V17 的应付 CHECK 换成含优惠的口径
--
-- 与 docs/business-rules/order.md ORD-21 一致：pay_amount = item_amount + shipping_fee - discount_amount。
-- 三列都是下单瞬间的快照，不是外键引用：
-- * discount_amount：券实际减免额（分）。满减券一次用完，面额即减免额，故不再单独存券面额。
-- * user_coupon_id：核销的券（跨 schema 裸引用不加 FK）。券后续被删也不影响订单自证减了多少、凭哪张券减的。
-- * coupon_bearer：承担方快照（SELLER / PLATFORM）。一期只有店铺券（恒 SELLER），但历史订单一旦生成就无法补写，
--   结算/分账模块将来要按它拆账，所以现在就落。
--
-- 为什么 discount 落在订单上而不是"读时按券算"：券的规则会改、券会被下架，订单必须能自证当时的金额构成。

ALTER TABLE orders.orders
    ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS user_coupon_id   UUID,
    ADD COLUMN IF NOT EXISTS coupon_bearer    VARCHAR(20);

-- 应付口径换挡：含优惠。这是 V17 注释里预告过的那次同步修改
ALTER TABLE orders.orders DROP CONSTRAINT IF EXISTS ck_orders_pay_amount;
ALTER TABLE orders.orders ADD CONSTRAINT ck_orders_pay_amount
    CHECK (pay_amount = item_amount + shipping_fee - discount_amount);

-- 优惠不能超过可减基数（否则实付为负）；券快照要么三列都有、要么都没有，不允许半份
ALTER TABLE orders.orders ADD CONSTRAINT ck_orders_discount_amount
    CHECK (discount_amount >= 0 AND discount_amount <= item_amount + shipping_fee);
ALTER TABLE orders.orders ADD CONSTRAINT ck_orders_coupon_bearer
    CHECK (coupon_bearer IS NULL OR coupon_bearer IN ('SELLER', 'PLATFORM'));
ALTER TABLE orders.orders ADD CONSTRAINT ck_orders_coupon_snapshot_complete
    CHECK ((user_coupon_id IS NULL) = (coupon_bearer IS NULL));
