SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 事件重放的权限点（/api/admin/events）。授 OPS（盯 shop.event.* 指标的人）和 SUPER_ADMIN。
-- 重放只清重投计数，投递仍走 EventRetryJob 唯一通路；重复消费由 EventInbox 去重 + 业务 CAS 挡住。

INSERT INTO common.permission (code, description)
VALUES ('EVENT_REPLAY', '事件重放：未完成事件清单 / 超限事件放行')
ON CONFLICT (code) DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'OPS', 'EVENT_REPLAY'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'EVENT_REPLAY')
ON CONFLICT DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'EVENT_REPLAY'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'EVENT_REPLAY')
ON CONFLICT DO NOTHING;
