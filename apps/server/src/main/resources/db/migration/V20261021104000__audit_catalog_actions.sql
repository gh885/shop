SET lock_timeout = '3s';
SET statement_timeout = '60s';

INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('catalog.offer.approved', 'catalog', '商品审核通过'),
    ('catalog.offer.rejected', 'catalog', '商品审核驳回')
ON CONFLICT (action) DO NOTHING;
