SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- trust 违规线索：检测方（fulfillment 等）上报事实，处置（扣分/限流/处罚）是治理的事，
-- 后续迁移补。线索三态：open → acknowledged（人看过了）/ dismissed（查了，不算违规）。
--
-- 幂等键 (kind, seller_order_id)：检测任务重跑、跨事务重试不产生重复线索。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE trust.violation_clue
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    kind            text        NOT NULL,
    merchant_id     uuid        NOT NULL,
    seller_order_id uuid,
    occurred_at     timestamptz NOT NULL,
    detail          text,
    status          text        NOT NULL DEFAULT 'open',
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_clue_kind CHECK (kind IN ('ship_overdue')),
    CONSTRAINT ck_clue_status CHECK (status IN ('open', 'acknowledged', 'dismissed'))
);

COMMENT ON TABLE trust.violation_clue IS
    '违规线索：检测模块上报的事实，处置在后续的 violation / enforcement_action，两回事';
COMMENT ON COLUMN trust.violation_clue.status IS
    'open=待处理；acknowledged=已人工看过；dismissed=查过，不构成违规';

CREATE UNIQUE INDEX uq_clue_order ON trust.violation_clue (kind, seller_order_id)
    WHERE seller_order_id IS NOT NULL;

CREATE INDEX idx_clue_status ON trust.violation_clue (status, created_at DESC);

-- 违规线索的查看权限（/api/admin/trust/clues）。授 OPS（盯告警的人）和 SUPER_ADMIN。
-- 线索只读不处置：处置要接扣分与申诉，那是后续迁移的事。

INSERT INTO common.permission (code, description)
VALUES ('TRUST_REVIEW', '查看违规线索（履约超时等，只读）')
ON CONFLICT (code) DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'OPS', 'TRUST_REVIEW'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'TRUST_REVIEW')
ON CONFLICT DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'TRUST_REVIEW'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'TRUST_REVIEW')
ON CONFLICT DO NOTHING;
