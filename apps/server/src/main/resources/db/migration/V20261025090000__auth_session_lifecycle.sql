SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 认证的会话层与账号生命周期。
--
-- 1) password_hash 放开 NOT NULL：短信验证码登录会自动注册，这类账号没有密码，
--    密码是后来在「账号安全」里设置的，不是注册的必选项。
-- 2) last_login_at：登录与刷新时落一笔。用途是休眠判定——号码被电信回收再放号后，
--    新机主凭短信码登进旧账号是真实攻击面；长期未活跃且有密码的账号不再吃短信通道。
-- 3) deletion_requested_at / deleted_at：自助注销的两段式——申请只落时刻，冷静期满
--    由定时任务匿名化（手机号换成不可回收的占位串，号码交还电信循环）。
-- 4) 员工管理的三个审计动作：审计是清单驱动，动作没登记直接抛异常。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE account.buyer ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE account.buyer ADD COLUMN last_login_at timestamptz;
COMMENT ON COLUMN account.buyer.last_login_at IS '最近一次登录/续期时刻；休眠判定与治理取数用';

ALTER TABLE account.buyer ADD COLUMN deletion_requested_at timestamptz;
COMMENT ON COLUMN account.buyer.deletion_requested_at IS '注销申请时刻；冷静期内可无限次撤销，期满由扫描器匿名化';

ALTER TABLE account.buyer ADD COLUMN deleted_at timestamptz;
COMMENT ON COLUMN account.buyer.deleted_at IS '注销生效时刻；行保留——历史订单要能一直指回人，身份解析按此列拒绝';

INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('account.staff.created',        'account', '创建平台员工'),
    ('account.staff.status_changed', 'account', '平台员工禁用/启用'),
    ('account.staff.role_changed',   'account', '平台员工岗位调整');
