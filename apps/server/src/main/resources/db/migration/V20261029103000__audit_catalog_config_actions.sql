SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 类目配置与品牌是平台侧写操作：改的是「所有商家发品时看到的规则」，必须能追到人。
INSERT INTO audit.audit_action (action, subject, description)
VALUES ('catalog.category.created', 'catalog', '新建类目'),
       ('catalog.category.config_updated', 'catalog', '修改类目配置'),
       ('catalog.category.attribute_added', 'catalog', '新增类目属性'),
       ('catalog.category.attribute_updated', 'catalog', '修改类目属性'),
       ('catalog.category.status_changed', 'catalog', '类目启用/停用'),
       ('catalog.category.sorted', 'catalog', '调整类目排序'),
       ('catalog.category.renamed', 'catalog', '类目改名'),
       ('catalog.category.value_created', 'catalog', '新增属性值'),
       ('catalog.category.value_updated', 'catalog', '修改属性值'),
       ('catalog.brand.created', 'catalog', '新建品牌'),
       ('catalog.brand.status_changed', 'catalog', '品牌审核状态变更')
ON CONFLICT (action) DO NOTHING;
