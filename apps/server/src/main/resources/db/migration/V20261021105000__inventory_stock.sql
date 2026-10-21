SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 单账本库存：实物 = 可售 + 预占 + 安全，由 CHECK 直接管住。
--
-- 形状与不变量见 docs/domain/inventory.md。三条硬约束在这里落地：
--   1. 守恒式 ck_stock_balance，任何写错当场被拒
--   2. 可售量只能条件更新递减，不许先查后改
--   3. stock_log 只追加，改了流动就等于没有流动
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS inventory;

COMMENT ON SCHEMA inventory IS '库存：单账本，平台是唯一写者；商家持货，平台记账';

CREATE TABLE inventory.stock
(
    sku_id       uuid        NOT NULL,
    warehouse_id uuid        NOT NULL,
    merchant_id  uuid        NOT NULL,
    on_hand      integer     NOT NULL,
    available    integer     NOT NULL,
    reserved     integer     NOT NULL,
    safety       integer     NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_stock PRIMARY KEY (sku_id, warehouse_id),
    CONSTRAINT ck_stock_balance CHECK (on_hand = available + reserved + safety),
    -- available 允许为负：负 = 已经超卖，进告警，不是 bug
    CONSTRAINT ck_stock_nonneg CHECK (on_hand >= 0 AND reserved >= 0 AND safety >= 0)
);

COMMENT ON TABLE inventory.stock IS '每个 SKU 每个仓一行；available 是交易链路的权威量';
COMMENT ON COLUMN inventory.stock.available IS '允许为负：出现负值说明账上已超卖，必须进告警';

CREATE INDEX idx_stock_merchant ON inventory.stock (merchant_id);

-- 一次预占一行。uq_reservation_line 就是下单幂等的锚点：
-- 同一张商家单的同一行只能预占一次，重复请求撞这里而不是再扣一次可售。
CREATE TABLE inventory.reservation
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    sku_id          uuid        NOT NULL,
    warehouse_id    uuid        NOT NULL,
    merchant_id     uuid        NOT NULL,
    order_group_id  uuid        NOT NULL,
    seller_order_id uuid        NOT NULL,
    line_no         integer     NOT NULL,
    quantity        integer     NOT NULL,
    status          text        NOT NULL DEFAULT 'reserved',
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- 键必须是 seller_order_id，不是 order_group_id：line_no 只在子单内唯一
    CONSTRAINT uq_reservation_line UNIQUE (seller_order_id, line_no),
    CONSTRAINT ck_reservation_qty CHECK (quantity > 0),
    CONSTRAINT ck_reservation_status CHECK (status IN
        ('reserved', 'committed', 'consumed', 'released', 'expired'))
);

COMMENT ON TABLE inventory.reservation IS '预占；expires_at = 订单 expire_at + 10 分钟宽限，上游事件丢了也能自己放回来';

CREATE INDEX idx_reservation_order ON inventory.reservation (seller_order_id);

-- 超时兜底扫描走这个部分索引，只捞还挂着的
CREATE INDEX idx_reservation_expire
    ON inventory.reservation (expires_at)
    WHERE status = 'reserved';

-- 库存流水。这是账，不是日志：能被 UPDATE 就等于没有流水。
CREATE TABLE inventory.stock_log
(
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    sku_id           uuid        NOT NULL,
    warehouse_id     uuid        NOT NULL,
    merchant_id      uuid        NOT NULL,
    type             text        NOT NULL,
    quantity         integer     NOT NULL,
    before_available integer     NOT NULL,
    after_available  integer     NOT NULL,
    before_reserved  integer     NOT NULL,
    after_reserved   integer     NOT NULL,
    before_safety    integer     NOT NULL,
    after_safety     integer     NOT NULL,
    before_on_hand   integer     NOT NULL,
    after_on_hand    integer     NOT NULL,
    ref_type         text,
    ref_id           uuid,
    idempotency_key  text        NOT NULL,
    operator_type    text        NOT NULL DEFAULT 'system',
    operator_id      uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_stock_log_idem UNIQUE (idempotency_key),
    CONSTRAINT ck_stock_log_type CHECK (type IN
        ('reserve', 'commit', 'ship', 'release', 'restock', 'adjust')),
    CONSTRAINT ck_stock_log_ref_type CHECK (ref_type IS NULL OR ref_type IN ('order', 'after_sale', 'manual')),
    CONSTRAINT ck_stock_log_operator CHECK (operator_type IN ('buyer', 'merchant', 'system')),
    -- commit 只推预占状态、不动任何科目列，所以数量必须是 0；
    -- 其余类型必须真的动了账，全零行等于什么都没发生，只会污染对账
    CONSTRAINT ck_stock_log_commit CHECK (type <> 'commit' OR quantity = 0),
    CONSTRAINT ck_stock_log_moved CHECK (
        type = 'commit'
            OR (before_available, before_reserved, before_safety, before_on_hand)
            IS DISTINCT FROM
               (after_available, after_reserved, after_safety, after_on_hand))
);

COMMENT ON TABLE inventory.stock_log IS '库存流水，只追加；幂等键形如 {type}:{ref_id}:{line_no}';
COMMENT ON COLUMN inventory.stock_log.quantity IS '有符号：+ 回补，- 扣减';

CREATE INDEX idx_stock_log_sku ON inventory.stock_log (sku_id, created_at);

CREATE TRIGGER trg_stock_log_append_only
    BEFORE UPDATE OR DELETE
    ON inventory.stock_log
    FOR EACH ROW
EXECUTE FUNCTION common.reject_mutation();
