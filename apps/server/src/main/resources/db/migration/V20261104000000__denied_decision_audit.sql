SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 拒绝审计：**只记拒绝，不记通过。**
--
-- 为什么不全量记决策：每个请求都会走 N 次判权，一次页面加载就能写几十行；而且
-- "通过"本身没有后果——它导致的那次写才有后果，那次写已经在 audit.entry 里了。
--
-- 拒绝要按 reason 分级，因为不同拒绝的含义完全不同：
--   out_of_scope / not_owner  有这类权限，但对象不是他的 → **这是唯一值得逐条留痕的**，
--                             它意味着这个人正在试着碰别人的数据
--   missing_permission        没有这个权限点 → 大概率是 UI 没藏好按钮，聚合计数即可
--   subject_disabled          身份已禁用
--
-- `reason` 这一列是整个表的价值所在。没有它，拒绝日志就是一堆 403，没人会看。
--
-- 事务语义与 audit.entry 相反：**尽力而为，可丢**。请求本来就要被拒，
-- 审计写失败不该改变结论；而变更审计必须与业务同事务，宁可不操作也不留黑账。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE authz.decision_denied
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    occurred_at   timestamptz NOT NULL DEFAULT now(),

    -- 与 authz.role_grant.subject_type 同域；买家也会出现在这里（越权尝试）
    subject_type  text        NOT NULL,
    subject_id    uuid        NOT NULL,

    -- 被拒的那个动作，形如 `after_sale_case:refund`
    action_code   text        NOT NULL,
    resource_type text,
    -- 列表查询没有具体资源，为 NULL；点查有
    resource_id   uuid,

    reason        text        NOT NULL,

    -- 排查的关键是"谁在什么时候想动哪个 id"，属性按那一刻的参数复算即可，**不存快照**：
    -- 快照会腐烂、会长成没人维护的 JSON 口袋，且它让"为什么拒"从可推理的事实变成需要解释的副本。
    request_id    text,
    ip            text,

    CONSTRAINT ck_denied_reason CHECK (
        reason IN ('out_of_scope', 'not_owner', 'missing_permission', 'subject_disabled'))
);

-- 告警扫描走这条：同一主体短时间内多次 out_of_scope = 有人在枚举。
CREATE INDEX idx_denied_subject ON authz.decision_denied (subject_id, occurred_at DESC);

COMMENT ON TABLE authz.decision_denied IS
    '被拒绝的授权尝试。只记拒绝；out_of_scope 与 not_owner 逐条留痕并告警，missing_permission 聚合即可';
