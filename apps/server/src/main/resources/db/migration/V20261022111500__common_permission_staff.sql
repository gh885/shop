SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 平台侧权限点。contracts/permissions.yaml 里列了 9 个 admin 域权限，但 common.permission
-- 只有 8 条卖家权限——那份契约文件和库对不上，而 Permission 枚举与库是双向比对的，
-- 所以「加权限点」必须同时改三处：本迁移、Permission 枚举、contracts/permissions.yaml。
--
-- 只加真正有挂点的。文档占位（SHOP_MANAGE / MEMBER_MANAGE 那类）不进库——
-- 一个永远为假的权限点比没有更糟：它让「这个人有权限吗」这个问题有第三种答案。
INSERT INTO common.permission (code, description) VALUES
    ('SHOP_REVIEW',        '入驻审核（通过与拒绝）'),
    ('SHOP_GOVERNANCE',    '平台侧店铺治理（封店/解封）'),
    ('CATEGORY_MANAGE',    '平台类目与属性模板维护'),
    ('CMS_MANAGE',         'CMS 内容维护'),
    ('LOGISTICS_MANAGE',   '物流轨迹维护'),
    ('COUPON_OPS',         '平台优惠券运营'),
    ('AUDIT_VIEW',         '操作审计查询'),
    ('RUM_VIEW',           '前端遥测排查')
ON CONFLICT (code) DO NOTHING;
