SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 手动触发定时任务的权限点（/api/admin/jobs）。授 OPS（盯指标的人）和 SUPER_ADMIN。
-- 触发与定时调度走同一条 runNow 路径，JobLock 与任务自身的幂等不因手动而绕过。

INSERT INTO common.permission (code, description)
VALUES ('JOB_TRIGGER', '手动触发定时任务（补发 / 对账 / 清理等）')
ON CONFLICT (code) DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'OPS', 'JOB_TRIGGER'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'JOB_TRIGGER')
ON CONFLICT DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'JOB_TRIGGER'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'JOB_TRIGGER')
ON CONFLICT DO NOTHING;
