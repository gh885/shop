-- V19: Inventory 模块 — 库存主体 + 流水账本；移除 product.skus.stock（库存唯一真相源迁入本模块）
-- 边界：库存归 inventory 拥有，product 只留"卖法"（SKU 的价/名/规格），不再持有任何库存列。
-- 冻结模型：stock=总库存(物理货量)，frozen_stock=冻结量(已下单未扣实)，可用量=stock-frozen_stock。
-- 扣减/冻结/释放/扣实一律条件更新（WHERE 可用>=n）防超卖；绝对量调整走 @Version 乐观锁（见 SkuStock.version）。

CREATE SCHEMA IF NOT EXISTS inventory;

-- 库存主体：一 SKU 一行（sku_id 全局唯一，一卖法一份货）
CREATE TABLE IF NOT EXISTS inventory.sku_stock (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    sku_id        UUID NOT NULL UNIQUE,           -- product.skus.id，裸引用不加 FK
    stock         INT NOT NULL DEFAULT 0 CHECK (stock >= 0),              -- 总库存（物理货量，只靠补货增）
    frozen_stock  INT NOT NULL DEFAULT 0 CHECK (frozen_stock >= 0),       -- 冻结量（已下单未扣实）
    version       INT NOT NULL DEFAULT 0,         -- 乐观锁：绝对量调整/读改写路径用
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (frozen_stock <= stock)                  -- 不可冻结超总库存
);

-- 存量迁移：现有 SKU 的 stock 落成库存主体（无冻结），保持业务连续
INSERT INTO inventory.sku_stock (sku_id, stock)
SELECT id, stock FROM product.skus WHERE stock IS NOT NULL AND stock >= 0;

-- 库存流水账本：append-only，每条变更一行，可重放对账。
-- before/after 为本次操作前后可用量（事务内所见，审计辅助）；quantity 带符号表达方向。
CREATE TABLE IF NOT EXISTS inventory.stock_movements (
    id               UUID PRIMARY KEY DEFAULT uuidv7(),
    sku_id           UUID NOT NULL,               -- product.skus.id，裸引用
    order_id         UUID,                        -- 关联订单（冻结/扣实/释放必有，补货为 NULL）
    type             VARCHAR(20) NOT NULL,        -- FREEZE 冻结 / CAPTURE 扣实 / RELEASE 释放 / RESTOCK 补货
    quantity         INT NOT NULL,                -- 本次变更量（正 = 可用增加，负 = 可用减少）
    before_available INT,                         -- 操作前可用量
    after_available  INT,                         -- 操作后可用量
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 流水只插不改（append-only 账本），无 updated_at
CREATE INDEX IF NOT EXISTS idx_movements_sku_created ON inventory.stock_movements(sku_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_order ON inventory.stock_movements(order_id);

-- 库存唯一真相源迁出：product.skus 不再持有库存列
ALTER TABLE product.skus DROP COLUMN stock;
