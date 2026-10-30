-- telemetry 库的第一条迁移。它同时定下三件事：库独立、schema 名、以及 event/issue 的分工。
--
-- 独立库（不是 shop 库里的一个 schema）：搬家清单第一条就是"独立 DB + 独立 migration 目录"，
-- 而 event 表的量与 shop 业务表差两个量级，混在一起会让备份、保留期、清理策略互相绑架。
SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS telemetry;

COMMENT ON SCHEMA telemetry IS '自建采集平台的全部数据；与 shop 的业务 schema 无任何外键关系';

-- 项目与 key。M0 与 relay 的本地 properties 对齐；M2 起由控制面维护（relay 只读缓存）。
CREATE TABLE telemetry.project
(
    project_id         text PRIMARY KEY,
    public_key         text        NOT NULL,
    allowed_origins    text[]      NOT NULL DEFAULT '{}',
    traces_sample_rate double precision NOT NULL DEFAULT 0.1,
    enabled            boolean     NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN telemetry.project.public_key IS 'DSN 里的公开标识，不保密；只决定"往哪个项目送"';

-- 事件的三种访问模式（点查原文 / 扫+聚合 / 事务化更新 issue）现在由这一张表 + 两张聚合表承担。
-- 刻意**不分区**：按天/月分区需要一个 DEFAULT 分区兜底，而 DEFAULT 分区一旦有数据，
-- 后续 ATTACH 新分区要全表扫描并在重叠时报错——这是运维陷阱，不是优化。
-- 触发条件写在 README「数据形状」：单表过千万行或 >100GB 再上分区，届时按 received_at 月分区。
CREATE TABLE telemetry.event
(
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id   text        NOT NULL,
    event_id     text        NOT NULL,
    received_at  timestamptz NOT NULL DEFAULT now(),
    occurred_at  timestamptz NOT NULL,
    kind         text        NOT NULL,
    level        text,
    platform     text,
    release      text,
    environment  text,
    transaction  text,
    tenant_id    text,
    trace_id     text,
    span_id      text,
    issue_id     bigint,
    fingerprint  text,
    payload      jsonb       NOT NULL,

    CONSTRAINT uq_event_project_event_id UNIQUE (project_id, event_id),
    CONSTRAINT ck_event_event_id CHECK (event_id ~ '^[0-9a-f]{32}$'),
    CONSTRAINT ck_event_trace_id CHECK (trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'),
    CONSTRAINT ck_event_span_id CHECK (span_id IS NULL OR span_id ~ '^[0-9a-f]{16}$')
);

COMMENT ON TABLE telemetry.event IS '不可变原文。重复投递靠 (project_id, event_id) 幂等，0 行更新是正常结果';
COMMENT ON COLUMN telemetry.event.payload IS '客户端发的原样，含我们暂时不理解的字段；可读栈是另存的，不覆盖这里';

CREATE INDEX ix_event_project_received ON telemetry.event (project_id, received_at DESC);
CREATE INDEX ix_event_issue ON telemetry.event (issue_id, received_at DESC);
CREATE INDEX ix_event_tenant ON telemetry.event (project_id, tenant_id, received_at DESC);
CREATE INDEX ix_event_trace ON telemetry.event (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX ix_event_release ON telemetry.event (project_id, release, received_at DESC);

-- issue 是可变聚合：可分配、可静默、可判回归。它的存在感全在"待办"上，不在"日志"上。
CREATE TABLE telemetry.issue
(
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id    text        NOT NULL,
    fingerprint   text        NOT NULL,
    title         text        NOT NULL,
    culprit       text,
    level         text,
    status        text        NOT NULL DEFAULT 'unresolved',
    first_seen    timestamptz NOT NULL,
    last_seen     timestamptz NOT NULL,
    event_count   bigint      NOT NULL DEFAULT 0,
    release_first text,
    release_last  text,
    tenant_id     text,

    CONSTRAINT uq_issue_project_fingerprint UNIQUE (project_id, fingerprint),
    CONSTRAINT ck_issue_status CHECK (status IN ('unresolved', 'resolved', 'ignored'))
);

CREATE INDEX ix_issue_project_last_seen ON telemetry.issue (project_id, status, last_seen DESC);

-- 丢弃计数：回答"为什么这条事件没了"。自建平台最常缺的就是这个答案。
CREATE TABLE telemetry.dropped
(
    project_id text  NOT NULL,
    kind       text  NOT NULL,
    reason     text  NOT NULL,
    day        date  NOT NULL,
    count      bigint NOT NULL DEFAULT 0,

    CONSTRAINT pk_dropped PRIMARY KEY (project_id, kind, reason, day)
);

-- 部署事件：RCA 的时间锚。路径照抄 Sentry，sentry-cli 能直接用。
CREATE TABLE telemetry.release
(
    project_id text        NOT NULL,
    version    text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_release PRIMARY KEY (project_id, version)
);
