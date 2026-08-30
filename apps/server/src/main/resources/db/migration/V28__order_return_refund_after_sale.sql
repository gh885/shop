-- V28: 退货退款售后 —— 售后状态机加 RETURNING（退货中），订单表加退货物流列。
--
-- 仅退款（货不退）与退货退款（货退回、回补库存）现在是同一条售后线的两支：
-- 申请（NONE→APPLYING，定 type）→ 卖家同意 → 仅退款直接 REFUNDED；退货退款进入 RETURNING
-- （等买家回寄、卖家收货）→ 收货确认后 REFUNDED 并回补库存。
-- 状态集唯一真相在代码（order.model.AfterSaleStatus / AfterSaleAction），此处只同步列与 CHECK。

-- 订单表加退货物流列（买家回寄时填写，仅退货退款路径）
ALTER TABLE orders.orders
    ADD COLUMN IF NOT EXISTS return_logistics_company VARCHAR(32),
    ADD COLUMN IF NOT EXISTS return_tracking_no        VARCHAR(64);

-- 售后状态 CHECK 放开 'RETURNING'，after_sale_type CHECK 放开 'RETURN_REFUND'。幂等：按名定位删旧约束再重建。
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_after_sale_status_check') THEN
        ALTER TABLE orders.orders
            DROP CONSTRAINT orders_after_sale_status_check;
        ALTER TABLE orders.orders
            ADD CONSTRAINT orders_after_sale_status_check
            CHECK (after_sale_status IN ('NONE', 'APPLYING', 'RETURNING', 'REFUNDED', 'REJECTED', 'CLOSED'));
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_after_sale_type_check') THEN
        ALTER TABLE orders.orders
            DROP CONSTRAINT orders_after_sale_type_check;
        ALTER TABLE orders.orders
            ADD CONSTRAINT orders_after_sale_type_check
            CHECK (after_sale_type IN ('REFUND_ONLY', 'RETURN_REFUND'));
    END IF;
END $$;
