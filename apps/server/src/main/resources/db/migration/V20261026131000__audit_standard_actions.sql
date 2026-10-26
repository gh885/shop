SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 标准品合并与挂靠的审计动作。
--
-- 这两个动作之前不存在，因为标准品运营整条链都没做。登记它们不是形式——
-- AuditRecorder 会校验动作必须在白名单里，不登记就抛，也就是说
-- 「合并错了一个标准品」这件事会变成一次 500，而运营以为是自己操作错了。
INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('catalog.standard.merged', 'catalog', '标准品合并（源并入目标，挂靠关系全部改指）'),
    ('catalog.standard.bound',  'catalog', '商家手动挂靠 / 取消挂靠标准品')
ON CONFLICT (action) DO NOTHING;
