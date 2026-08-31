-- V31 之后：把 after_sale 两个 CHECK 约束的定义钉死，不再依赖自动生成的约束名。
--
-- 背景：V28 放开 RETURNING / RETURN_REFUND 时写的是
--     IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_after_sale_status_check') THEN …
-- 约束名是 PG 自动生成的，同名冲突时会变成 _check1、_check2；建表历史稍有不同就对不上。
-- 对不上时那段 DO 块什么也不做、也不报错——迁移"成功"，但 CHECK 还停在 V26 的旧取值集，
-- 直到运行时写入 RETURNING 才炸成约束冲突。静默的迁移是最难查的一类。
--
-- 本迁移按「约束定义引用了哪一列」定位并重建，与名字无关；并在列缺失时显式 RAISE，
-- 让问题落在迁移阶段而不是某个下午的订单流里。

DO $$
DECLARE
    c RECORD;
BEGIN
    -- 前置断言：列必须存在（V26/V28 已建）。缺列说明迁移链断了，就地失败而非继续
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'orders' AND table_name = 'orders' AND column_name = 'after_sale_status'
    ) THEN
        RAISE EXCEPTION 'orders.orders.after_sale_status 不存在，V26 迁移未生效';
    END IF;

    -- 按定义里引用的列名定位既有 CHECK（含 V26/V28 留下的任意自动名），全部丢弃后统一重建。
    -- 重复执行安全：重建出来的约束下次仍会被这段循环命中并重建。
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'orders.orders'::regclass
          AND contype = 'c'
          AND (pg_get_constraintdef(oid) LIKE '%after_sale_status%'
               OR pg_get_constraintdef(oid) LIKE '%after_sale_type%')
    LOOP
        EXECUTE format('ALTER TABLE orders.orders DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

-- 取值集的唯一真相在代码侧（order.model 的 AfterSaleStatus / AfterSaleType），此处只同步。
-- 显式命名，后续迁移可直接按名引用，不必再猜自动名。
ALTER TABLE orders.orders
    ADD CONSTRAINT ck_orders_after_sale_status
    CHECK (after_sale_status IN ('NONE', 'APPLYING', 'RETURNING', 'REFUNDED', 'REJECTED', 'CLOSED'));

ALTER TABLE orders.orders
    ADD CONSTRAINT ck_orders_after_sale_type
    CHECK (after_sale_type IN ('REFUND_ONLY', 'RETURN_REFUND'));
