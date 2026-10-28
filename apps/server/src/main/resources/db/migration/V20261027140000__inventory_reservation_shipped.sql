SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 出库按包裹分批，预占必须能记「已经出了多少件」。
--
-- 在此之前 ship 是按整行预占量一次扣完的，而 fulfillment 支持一个子单分多个包裹发：
-- 第一批发出去之后，第二批发什么、剩多少预占该放，库里没有任何东西能回答。
--
-- 两处改动：
--   1. reservation.shipped_quantity —— 已出库件数，quantity 保持不可变（预占原样留底）
--   2. stock_ledger.ref_type 增加 'package' —— 出库流水的事实单是包裹，不是订单
--
-- 「是不是发完了」由 shipped_quantity = quantity 判定，不新增状态值：
-- 状态与计数写在同一条 UPDATE 里，没有第二个可以漂的地方。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory.reservation ADD COLUMN shipped_quantity integer NOT NULL DEFAULT 0;

-- 已出库量只能是 [0, quantity]：负数说明扣反了，超过 quantity 说明超发
ALTER TABLE inventory.reservation
    ADD CONSTRAINT ck_reservation_shipped CHECK (shipped_quantity >= 0 AND shipped_quantity <= quantity);

COMMENT ON COLUMN inventory.reservation.shipped_quantity IS
    '已出库件数；quantity 不可变，剩余预占 = quantity - shipped_quantity。两者相等即为 consumed';

-- 出库流水的事实单是包裹：一个包裹一批出库，幂等键 ship:{package_id}:{line_no}。
-- 用 order 当 ref_id 表达不了「同一行分两批发」，用 seller_order 会在一行多包裹时撞键。
--
-- 按名字删而不是只删 ck_stock_ledger_ref_type：`V20261025232000` 里那组改名在部分库中
-- 是「文件改了、迁移早就记成 success」的状态，约束还叫 `ck_stock_log_ref_type`。
-- 两种名字都试一遍，谁在删谁——不猜这一库的来源。
DO $$
BEGIN
    ALTER TABLE inventory.stock_ledger DROP CONSTRAINT IF EXISTS ck_stock_ledger_ref_type;
    ALTER TABLE inventory.stock_ledger DROP CONSTRAINT IF EXISTS ck_stock_log_ref_type;
END $$;

ALTER TABLE inventory.stock_ledger
    ADD CONSTRAINT ck_stock_ledger_ref_type
        CHECK (ref_type IS NULL OR ref_type IN ('order', 'rma', 'package', 'manual'));

COMMENT ON COLUMN inventory.stock_ledger.ref_type IS
    '事实单类型：order（预占/确认/释放）/ package（出库）/ rma（退货入库）/ manual（商家调整）';
