SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 商品审核权限点。类目配置（CATEGORY_MANAGE）和商品审核（PRODUCT_REVIEW）分开：
-- 运营定"这个格子要填什么"，审核员判"这条商品合不合规"，是两拨人两种判断。
-- 合成一个点，就等于让每个能改类目的人都能放行商品——而类目是发布闸门的输入，
-- 改了类目再审商品，等于自己出题自己批卷。

INSERT INTO common.permission (code, description)
VALUES ('PRODUCT_REVIEW', '商品审核：通过 / 驳回 / 下架')
ON CONFLICT (code) DO NOTHING;

-- REVIEWER 岗位拿到它。商品审核是审核岗的主职，不该落在 OPS 上。
INSERT INTO staff.role_permission (role, permission_code)
SELECT 'REVIEWER', 'PRODUCT_REVIEW'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'PRODUCT_REVIEW')
ON CONFLICT DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'PRODUCT_REVIEW'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'PRODUCT_REVIEW')
ON CONFLICT DO NOTHING;

-- 下架的审计动作。上架（catalog.offer.approved）和审核两个动作上一个迁移已登记。
INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('catalog.offer.offline', 'catalog', '商品下架')
ON CONFLICT (action) DO NOTHING;
