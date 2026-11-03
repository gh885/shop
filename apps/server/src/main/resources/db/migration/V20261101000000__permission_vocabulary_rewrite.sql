SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 权限码重写：`contracts/permissions.yaml` 成为唯一真相源，库里不再存"有哪些码"。
--
-- 三件事：
--   1. 岗位授权改成新码形态（`resource:action` 小写）
--   2. SUPER_ADMIN 的授权行删掉——它的集合改为**从清单推导**，与商家主账号同一口径：
--      "什么都有的角色"不该是一份需要有人记得同步的种子。漏同步的后果是它忽然少了某个权限，
--      而这种事不会报错，只会在某天发现超管点不动一个按钮。
--   3. 删掉 `common.permission`——目录表和代码枚举各存一份清单是靠对拍兜着的冗余，
--      现在清单只活在 yaml 里，库里的码由启动校验（Authorizer）对着清单核。

DELETE FROM staff.role_permission;

INSERT INTO staff.role_permission (role, permission_code) VALUES
    ('REVIEWER', 'shop:review'),
    ('REVIEWER', 'shop:suspend'),
    ('REVIEWER', 'audit_log:read'),

    ('OPS', 'category:configure'),
    ('OPS', 'content_article:write'),
    ('OPS', 'package:track'),
    ('OPS', 'coupon:configure'),
    ('OPS', 'audit_log:read'),
    ('OPS', 'rum_report:read'),
    ('OPS', 'shop:suspend')
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS common.permission;
