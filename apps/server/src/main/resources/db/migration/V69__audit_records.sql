-- V69: Audit 模块 —— 管理端操作审计账本（谁、对谁、做了什么、什么时候）
-- 动机：治理动作（封号、作废券、审核、封店、员工调权）此前只进结构化日志，日志按 trace 检索、
-- 会随保留期滚动消失，且没人能按「操作人 / 对象 / 时间」反查。审计是合规与追责的诉求：
-- 动作发生的那一刻把「谁对哪个对象做了什么」写成一行不可变账本，运营/平台能查、能导出。
--
-- 设计取舍：
--   * append-only 账本：不记 updated_at（继承 BaseEntity 而非 AuditedEntity），没有 UPDATE 入口。
--   * 与业务动作同事务：写入经 audit :: api 的 RecordAuditCommand 同步调用，动作回滚时审计行一起回滚——
--     「动作没发生却留下审计行」比缺一行更坏（查出来是假账）。
--   * 敏感字段只落掩码：detail 是自由文本，调用点必须自己先掩（PhoneNumber.mask 形状）；
--     本模块不解析、不还原，只忠实存。
--   * 枚举口径收在 audit 模块的 AuditAction：动作名 + 目标类型是同一格，不允许两处各写各的。

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.audit_records (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    action        VARCHAR(64) NOT NULL,          -- AuditAction 的 code 形状，如 account.user.status_changed
    target_type   VARCHAR(32) NOT NULL,          -- AuditAction 声明的目标类型（USER / STAFF / USER_COUPON / SHOP / SHOP_REVIEW / SHIPMENT_ISSUE / SHIPMENT）
    target_id     VARCHAR(64) NOT NULL,          -- 被操作对象的 ID 文本（对象 ID 都是 UUID，存文本免去跨类型解析）
    operator_id   UUID NOT NULL,                 -- 操作人 = 平台员工 id（account.staff.id），无头无尾不给
    operator_name VARCHAR(50),                 -- 操作人展示名快照；查无此人时为 NULL（前台显「未知操作人」）
    detail        VARCHAR(200),                  -- 人话/键值说明；敏感字段只允许以掩码形状落库
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 审计查询的主路径：按操作人倒序翻页（「这个员工做过什么」）
CREATE INDEX IF NOT EXISTS idx_audit_records_operator
    ON audit.audit_records(operator_id, created_at DESC);

-- 按对象倒查（「这个用户/这张券被谁动过」）
CREATE INDEX IF NOT EXISTS idx_audit_records_target
    ON audit.audit_records(target_type, target_id, created_at DESC);

-- 纯时间窗翻页（导出与按天核对）
CREATE INDEX IF NOT EXISTS idx_audit_records_created_at
    ON audit.audit_records(created_at DESC);
