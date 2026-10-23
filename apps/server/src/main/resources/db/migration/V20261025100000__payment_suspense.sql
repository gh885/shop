SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 挂账待查：钱到了但订单推进不了的三种情况，统一落 payment.suspense_entry，
-- 替换之前三处各写各的日志。这是运维侧的待查队列（+管理端退款/驳回入口）；
-- 账本层的 suspense 分录（clearing 按 matched 分流记账）是另一层设计，见 docs/domain/ledger.md。
--   late_callback   支付单已关/已失败后渠道才报成功——钱在渠道手里
--   amount_mismatch 钱到了但金额和应付对不上
--   order_closed    支付成功但订单已被超时关单/取消，markPaid 输了
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE payment.suspense_entry
(
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    payment_id     uuid NOT NULL,
    order_group_id uuid NOT NULL,
    reason         text NOT NULL,
    channel        text NOT NULL,
    channel_txn_id text,
    amount         bigint NOT NULL,
    currency       char(3) NOT NULL DEFAULT 'CNY',
    raw_payload    jsonb,
    status         text NOT NULL DEFAULT 'open',
    resolution     text,
    note           text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    resolved_at    timestamptz,

    -- 同一件事只挂一次：渠道重投回调、事件重放，都不该把同一笔钱挂两条
    CONSTRAINT uq_suspense_payment_reason UNIQUE (payment_id, reason),
    CONSTRAINT ck_suspense_reason CHECK (reason IN ('late_callback', 'amount_mismatch', 'order_closed')),
    CONSTRAINT ck_suspense_status CHECK (status IN ('open', 'resolved')),
    CONSTRAINT ck_suspense_amount CHECK (amount > 0),
    CONSTRAINT ck_suspense_resolution CHECK (resolution IS NULL OR resolution IN ('refunded', 'dismissed')),
    -- 销账三件套同生同死：open 时不许有 resolution，resolved 时必须有
    CONSTRAINT ck_suspense_lifecycle CHECK (
        (status = 'open') = (resolution IS NULL AND resolved_at IS NULL))
);

COMMENT ON TABLE payment.suspense_entry IS '挂账待查：钱到但推进不了，统一登记，管理端人工退款或驳回';
COMMENT ON COLUMN payment.suspense_entry.raw_payload IS '渠道原始回调报文（迟到回调路径），出问题时唯一能还原的东西';
COMMENT ON COLUMN payment.suspense_entry.resolution IS 'refunded=已原路退款 / dismissed=人工驳回（不是真钱或已线下处理）';

-- 清单只关心 open 的：处理速度靠这条索引
CREATE INDEX idx_suspense_open ON payment.suspense_entry (created_at) WHERE status = 'open';

-- 挂账退款不带子单（seller_order_id IS NULL），uq_refund_biz 的 = 比较拦不住 NULL 的重复
-- （PG 里 NULL ≠ NULL）。表达式唯一索引把 NULL 折算成 nil uuid，让挂账退款也吃索引去重；
-- RefundOrderStore 的 INSERT ON CONFLICT 指到的就是它。
CREATE UNIQUE INDEX uq_refund_suspense_biz
    ON payment.refund_order (payment_id, COALESCE(seller_order_id, '00000000-0000-0000-0000-000000000000'::uuid), reason);

-- 挂账管理权限：清单、手动退款、驳回。只授 SUPER_ADMIN——这是动真钱的出口，
-- 等财务岗建起来，把授权改到那个岗位即可，权限点本身不用动。
INSERT INTO common.permission (code, description)
VALUES ('SUSPENSE_MANAGE', '挂账待查：清单 / 手动退款 / 驳回')
ON CONFLICT (code) DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'SUSPENSE_MANAGE'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'SUSPENSE_MANAGE')
ON CONFLICT DO NOTHING;
