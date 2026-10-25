SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS cart;

-- ─────────────────────────────────────────────────────────────────────────────
-- 购物车。只存选购意图：归属 + SKU 指针 + 数量/勾选，不锁价不锁库存。
--
-- 标题/现价/库存/店铺一律不落库——购物车展示的是加购到下单之间的比价窗口，
-- 读取时经 catalog :: api 批查拼装；下单那一刻的快照由报价单和订单行负责。
-- 条目谁也不引用（订单做快照），删除即硬删，无软删列。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE cart.items
(
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    buyer_id   uuid        NOT NULL,
    sku_id     uuid        NOT NULL,
    quantity   int         NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    selected   boolean     NOT NULL DEFAULT TRUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cart.items IS '购物车条目——「这个买家想买几个什么」；价格与库存快照都不在这里';
COMMENT ON COLUMN cart.items.quantity IS '单条目上限 999 与 common.CartRules.LINE_QUANTITY_MAX 同值，改要同步';
COMMENT ON COLUMN cart.items.selected IS '结算勾选位；勾选集合是声明式资源，PUT /api/buyer/cart/selection 整车重设';

-- 同买家同 SKU 唯一：加购合并（ON CONFLICT 累加封顶）与条目按 skuId 寻址的根基
CREATE UNIQUE INDEX uk_cart_items_buyer_sku
    ON cart.items (buyer_id, sku_id);

CREATE INDEX idx_cart_items_buyer ON cart.items (buyer_id, created_at);
