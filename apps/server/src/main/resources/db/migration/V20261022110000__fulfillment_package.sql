SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 履约：包裹 / 包裹明细 / 发货时效任务。
--
-- 形状与不变式见 docs/domain/fulfillment.md。四条硬约束在这里落地：
--   1. 包裹是唯一事实：订单只存"发了几件"的计数器，包裹和运单号全在这里
--   2. 同一运单号只能挂一个包裹（uq_package_tracking）——商家手误录两遍要被库挡住
--   3. 拆包由商家决定，平台只要求每个包裹能追溯到订单行和数量
--   4. 状态单调，只升不降；这条靠代码，库只能钉住合法取值
--
-- 这一版只做「商家填运单号发货」和「确认收货」两条链路：
--   - 轨迹回写要 logistics 先落地（认标准码那层），现在没做
--   - 时效检测要 trust 的违规线索接口，现在也没做
-- 表结构按完整形状建，是因为加列比改形状贵。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS fulfillment;

COMMENT ON SCHEMA fulfillment IS '履约：包裹、拆包、发货时效；只认八个标准码，不认承运商码';

CREATE TABLE fulfillment.package
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    package_no      text        NOT NULL,
    seller_order_id uuid        NOT NULL,
    merchant_id     uuid        NOT NULL,
    delivery_type   text        NOT NULL DEFAULT 'express',
    carrier_code    text,
    tracking_no     text,
    status          text        NOT NULL DEFAULT 'created',
    shipped_at      timestamptz,
    delivered_at    timestamptz,
    last_track_at   timestamptz,
    signed_by       text,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_package_no UNIQUE (package_no),
    -- 同一运单号只能挂一个包裹：商家手误录两遍，要当场被拒，而不是等买家收到两个包裹才发现。
    -- 用 NULLS NOT DISTINCT 之外的做法不行——PG 的 UNIQUE 默认把 NULL 当互不相等，
    -- 而 created 状态的包裹恰好没有运单号，所以这里只对填了运单号的行生效（部分索引）
    CONSTRAINT ck_package_type CHECK (delivery_type = 'express'),
    CONSTRAINT ck_package_status CHECK (status IN
        ('created', 'shipped', 'in_transit', 'delivered', 'returned', 'cancelled')),
    -- 除了 created / cancelled，其余状态都必须有承运商和运单号
    CONSTRAINT ck_package_tracking_required CHECK (
        status IN ('created', 'cancelled')
            OR (carrier_code IS NOT NULL AND tracking_no IS NOT NULL)),
    -- 时间戳与状态必须同生同死，否则会出现"已签收但 delivered_at 是空"
    CONSTRAINT ck_package_delivered CHECK (
        (status = 'delivered') = (delivered_at IS NOT NULL))
);

COMMENT ON TABLE fulfillment.package IS '包裹 = 唯一事实；订单那边只存 shipped_qty 计数器';
COMMENT ON COLUMN fulfillment.package.last_track_at IS '最后一条轨迹时间；停滞检测靠它，现在还没接轨迹';

CREATE INDEX idx_package_seller_order ON fulfillment.package (seller_order_id);
CREATE INDEX idx_package_merchant ON fulfillment.package (merchant_id, created_at DESC);

-- 运单号去重。部分索引：没有运单号的包裹（created / cancelled）不参与
CREATE UNIQUE INDEX uq_package_tracking
    ON fulfillment.package (carrier_code, tracking_no)
    WHERE tracking_no IS NOT NULL;

CREATE TABLE fulfillment.package_item
(
    package_id    uuid    NOT NULL,
    order_line_id uuid    NOT NULL,
    quantity      integer NOT NULL,

    CONSTRAINT pk_package_item PRIMARY KEY (package_id, order_line_id),
    CONSTRAINT ck_package_item_qty CHECK (quantity > 0)
);

COMMENT ON TABLE fulfillment.package_item IS '拆包的全部表达：一行拆两包是两条记录，两行装一包也是两条记录';

CREATE INDEX idx_package_item_line ON fulfillment.package_item (order_line_id);

CREATE TABLE fulfillment.ship_task
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    seller_order_id uuid        NOT NULL,
    merchant_id     uuid        NOT NULL,
    due_at          timestamptz NOT NULL,
    status          text        NOT NULL DEFAULT 'pending',
    overdue_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- 一个商家单一条任务：发多个包裹不影响它，第一个包裹发出就置 shipped
    CONSTRAINT uq_ship_task_order UNIQUE (seller_order_id),
    CONSTRAINT ck_ship_task_status CHECK (status IN ('pending', 'shipped', 'overdue', 'cancelled'))
);

COMMENT ON TABLE fulfillment.ship_task IS '承诺发货截止；overdue 之后仍然可以发货，它只表示曾经超过承诺时间';

-- 超时检测只扫这个部分索引
CREATE INDEX idx_ship_task_due
    ON fulfillment.ship_task (due_at)
    WHERE status = 'pending';
