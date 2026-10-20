SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 操作审计：谁在什么时候把哪条数据从什么改成了什么
--
-- 设计要点见 docs/domain/ledger.md 第 10 节与 docs/domain/database.md 第 1 节。
-- 一句话：清单驱动（能审计什么由 audit_action 说了算）、只追加（触发器拦 UPDATE/DELETE）、
--         记 diff 而不记方法名。
-- ─────────────────────────────────────────────────────────────────────────────

-- 迁移里反复要用：只追加表的护栏
CREATE OR REPLACE FUNCTION common.reject_mutation() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION '表 % 是只追加的，不允许 %', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

COMMENT ON FUNCTION common.reject_mutation() IS '只追加表的护栏：拦掉一切 UPDATE / DELETE';

-- 审计动作清单。清单驱动是这套设计的核心：能审计什么由这张表决定，
-- 而不是由"记得给方法加注解"决定。新增动作 = 一次迁移，评审时看得见。
CREATE TABLE common.audit_action
(
    action      text PRIMARY KEY,
    subject     text        NOT NULL,
    description text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE common.audit_action IS '审计动作清单；代码里出现未登记的动作直接抛异常';
COMMENT ON COLUMN common.audit_action.subject IS '归属模块，与 module-map.md 的模块名一致';

INSERT INTO common.audit_action (action, subject, description) VALUES
    ('trade.order.price_changed',     'trade',     '订单改价'),
    ('catalog.sku.delisted',          'catalog',   '商品下架'),
    ('inventory.quantity_adjusted',   'inventory', '库存手工调整'),
    ('trust.commission_rate_changed', 'trust',     '佣金率变更'),
    ('clearing.manual_adjustment',    'clearing',  '资金手工调账');

-- 审计主表。按 occurred_at 月分区：这张表只增不删不更新，分区是唯一的清理手段
-- （DROP PARTITION 秒级，DELETE 会锁表 + WAL 暴涨）。
CREATE TABLE common.audit_log
(
    id            uuid        NOT NULL DEFAULT uuidv7(),
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    action        text        NOT NULL,
    object_type   text        NOT NULL,
    object_id     text        NOT NULL,
    operator_type text        NOT NULL,
    operator_id   uuid,
    merchant_id   uuid,
    changes       jsonb       NOT NULL,
    result        text        NOT NULL,
    trace_id      text,
    client_ip     inet,

    CONSTRAINT pk_audit_log PRIMARY KEY (id, occurred_at),
    CONSTRAINT ck_audit_log_operator_type CHECK (operator_type IN ('buyer', 'merchant', 'staff', 'system')),
    CONSTRAINT ck_audit_log_result CHECK (result IN ('success', 'failure'))
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE common.audit_log IS '操作审计；只追加，按 occurred_at 月分区';
COMMENT ON COLUMN common.audit_log.changes IS 'JSONB diff，形如 {"price": {"before": 9900, "after": 8900}}';
COMMENT ON COLUMN common.audit_log.operator_id IS '系统操作（定时任务、消息消费）为 NULL，operator_type 记 system';

-- 客服按对象查是主路径，只建这一个索引。
-- 「按操作人查」交给以后的异构索引表，不在只追加表上堆索引——堆上去写入先垮。
CREATE INDEX idx_audit_log_object ON common.audit_log (object_type, object_id, occurred_at);

-- 先建未来 15 个月的分区，最后建 DEFAULT 兜底。
-- DEFAULT 是安全带不是方案：真落到 DEFAULT 里说明分区任务该修了。
DO
$$
DECLARE
    base date := date_trunc('month', now())::date;
    lo   date;
    hi   date;
BEGIN
    FOR i IN 0..14 LOOP
        lo := (base + (i || ' month')::interval)::date;
        hi := (base + ((i + 1) || ' month')::interval)::date;
        EXECUTE format(
                'CREATE TABLE IF NOT EXISTS common.audit_log_%s PARTITION OF common.audit_log FOR VALUES FROM (%L) TO (%L)',
                to_char(lo, 'YYYYMM'), lo, hi);
    END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS common.audit_log_default PARTITION OF common.audit_log DEFAULT;

CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE
    ON common.audit_log
    FOR EACH ROW
EXECUTE FUNCTION common.reject_mutation();
