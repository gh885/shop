SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 售后冻结：有未终态售后的钱不许被结算打走。
--
-- 文档 §2.4 的口径：售后进行中，钱从 pending（或已解冻的 available）划到 frozen，
-- 售后判给商家再划回去，判给买家就直接从 frozen 冲销。
--
-- 这张表是冻结的"业务进度"，不参与算余额——余额永远由分录驱动。
-- 一笔售后一行，撤销/拒绝/退款后关掉，不会再冻第二次。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE clearing.freeze_item
(
    case_id         uuid PRIMARY KEY,
    seller_order_id uuid        NOT NULL,
    merchant_id     uuid        NOT NULL,
    currency        char(3)     NOT NULL,
    amount          bigint      NOT NULL,
    source          text        NOT NULL,
    status          text        NOT NULL DEFAULT 'frozen',
    created_at      timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz,

    CONSTRAINT ck_freeze_amount CHECK (amount > 0),
    -- 钱从哪来，退回哪里去：申请时从 pending 冻的，撤销就回 pending
    CONSTRAINT ck_freeze_source CHECK (source IN ('pending', 'available')),
    CONSTRAINT ck_freeze_status CHECK (status IN ('frozen', 'released', 'consumed'))
);

COMMENT ON TABLE clearing.freeze_item IS
    '售后冻结：一个 case 一行；amount 是商家净额部分（不是退款总额，佣金不冻）';
COMMENT ON COLUMN clearing.freeze_item.source IS
    '冻结时钱在哪：还没解冻就在 pending，已经解冻就在 available';

CREATE INDEX idx_freeze_open ON clearing.freeze_item (merchant_id)
    WHERE status = 'frozen';
