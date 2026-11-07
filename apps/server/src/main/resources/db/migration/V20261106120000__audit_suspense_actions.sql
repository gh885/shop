-- 挂账的两个员工动作接审计：驳回与退款动的都是真钱，此前只有 log.info，
-- 「谁在什么时候处理了哪条挂账」库里无处可查。
INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('payment.suspense.refunded',  'payment', '挂账原路退款'),
    ('payment.suspense.dismissed', 'payment', '挂账驳回');
