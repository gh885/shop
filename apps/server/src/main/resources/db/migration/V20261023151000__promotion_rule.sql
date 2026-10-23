SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 促销：只建规则表，一条规则就够让算价跑通全链路。
--
-- 不建：campaign（活动）、coupon_stock / coupon_instance（券）、预算、互斥关系表。
-- 计算语义只由 rate_bp / fixed_amount / base_mode 三列决定，所以「加一种新玩法」是加一行，
-- 不是加一列，也不用改 pricing 的主流程。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS promotion;

COMMENT ON SCHEMA promotion IS '促销：规则数据归这里，算价不归这里；pricing 通过 api 取 AppliedRule';

CREATE TABLE promotion.promotion_rule
(
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    name         text        NOT NULL,
    type         text        NOT NULL,
    scope        text        NOT NULL,
    bearer       text        NOT NULL,
    threshold    bigint,
    rate_bp      integer,
    fixed_amount bigint,
    base_mode    text        NOT NULL DEFAULT 'original',
    mutex_group  text,
    priority     integer     NOT NULL DEFAULT 100,
    category_ids uuid[],
    status       text        NOT NULL DEFAULT 'draft',
    version      integer     NOT NULL DEFAULT 1,
    starts_at    timestamptz,
    ends_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_promotion_scope CHECK (scope IN ('line', 'seller_order', 'order_group')),
    CONSTRAINT ck_promotion_bearer CHECK (bearer IN ('platform', 'merchant')),
    CONSTRAINT ck_promotion_base_mode CHECK (base_mode IN ('original', 'after_previous')),
    CONSTRAINT ck_promotion_status CHECK (status IN ('draft', 'active', 'archived')),
    -- 一条规则要么按比例减，要么按定额减；两个都填或都不填，算价不知道该听谁
    CONSTRAINT ck_promotion_benefit CHECK (num_nonnulls(rate_bp, fixed_amount) = 1),
    CONSTRAINT ck_promotion_rate CHECK (rate_bp IS NULL OR (rate_bp > 0 AND rate_bp <= 10000)),
    CONSTRAINT ck_promotion_fixed CHECK (fixed_amount IS NULL OR fixed_amount > 0),
    CONSTRAINT ck_promotion_threshold CHECK (threshold IS NULL OR threshold > 0),
    CONSTRAINT ck_promotion_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

COMMENT ON TABLE promotion.promotion_rule IS
    '规则行；type 只用于证据展示，真正决定算多少的是 rate_bp / fixed_amount / base_mode';
COMMENT ON COLUMN promotion.promotion_rule.category_ids IS
    'null = 全类目；非空则与购物车里的类目求交集，交不上就不返回';
COMMENT ON COLUMN promotion.promotion_rule.version IS
    '改了金额参数必须 +1：报价单靠它还原"当时是哪一版"';
COMMENT ON COLUMN promotion.promotion_rule.priority IS
    '数值小 = 优先级高，与 pricing 的执行顺序是同一个口径';

-- 生效规则查询的唯一路径：状态 + 时间窗，类目在 SQL 里求交集，不把全平台规则捞进内存
CREATE INDEX idx_promotion_rule_active ON promotion.promotion_rule (priority, id)
    WHERE status = 'active';

-- 演示规则：满 200 减 20，平台承担，看原价。删掉这一行不影响表结构。
INSERT INTO promotion.promotion_rule
    (id, name, type, scope, bearer, threshold, fixed_amount, base_mode, priority, status, version, starts_at)
VALUES
    ('01900000-0000-7000-8000-000000000001', '全场满 200 减 20', 'ORDER_THRESHOLD_OFF',
     'order_group', 'platform', 20000, 2000, 'original', 100, 'active', 1, now());
