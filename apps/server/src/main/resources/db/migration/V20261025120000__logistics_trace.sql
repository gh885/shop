SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 物流：承运商轨迹回传。
--
-- 两张表，职责和 fulfillment.md §2 对齐：
--   trace_event       每条原始轨迹一行，同时存翻译后的标准码——轨迹是流水，只增不改
--   carrier_code_map  承运商原始码 → 平台标准码的码表。**建出来就是空的**：
--                     接真渠道时录码表，查不到映射一律 unknown，绝不猜——
--                     猜错会把"退签"当"签收"，直接触发结算，那是资损
--
-- fulfillment.package.delivered_source 加 'trace'：承运商轨迹签收是第三种来源，
-- 和买家手点、系统到期一样与 delivered_at 同生共死。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS logistics;

CREATE TABLE logistics.trace_event
(
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    package_id     uuid        NOT NULL,
    carrier_code   text        NOT NULL,
    tracking_no    text        NOT NULL,
    raw_code       text        NOT NULL,
    standard_code  text        NOT NULL,
    description    text,
    occurred_at    timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_trace_standard CHECK (standard_code IN
        ('collected', 'in_transit', 'out_for_delivery', 'delivered', 'rejected', 'returned', 'exception', 'unknown')),
    -- 同一条轨迹推两遍只生效一次。fulfillment.recordTrace 的幂等契约（fulfillment.md）
    -- 靠这把唯一键兑现：冲突的那次连 recordTrace 都不会被调
    CONSTRAINT uq_trace_natural UNIQUE (package_id, raw_code, occurred_at)
);

COMMENT ON TABLE logistics.trace_event IS '承运商原始轨迹 + 翻译后的标准码；轨迹是流水，只增不改';
COMMENT ON COLUMN logistics.trace_event.standard_code IS '翻译结果，八个标准码之一；unknown = 码表里查不到，绝不猜';

CREATE INDEX idx_trace_event_package ON logistics.trace_event (package_id, occurred_at DESC);

CREATE TABLE logistics.carrier_code_map
(
    carrier_code   text NOT NULL,
    raw_code       text NOT NULL,
    standard_code  text NOT NULL,
    note           text,

    PRIMARY KEY (carrier_code, raw_code),
    CONSTRAINT ck_map_standard CHECK (standard_code IN
        ('collected', 'in_transit', 'out_for_delivery', 'delivered', 'rejected', 'returned', 'exception', 'unknown'))
);

COMMENT ON TABLE logistics.carrier_code_map IS
    '承运商原始码 → 平台标准码。当前为空：接真渠道时录码表；查不到映射一律 unknown，绝不猜';

-- 承运商轨迹签收是第三种签收来源，争议口径三值齐了：buyer / system / trace
ALTER TABLE fulfillment.package DROP CONSTRAINT ck_package_delivered_source;
ALTER TABLE fulfillment.package
    ADD CONSTRAINT ck_package_delivered_source CHECK (delivered_source IN ('buyer', 'system', 'trace'));
