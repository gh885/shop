SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 权限点的治理元数据：owner（哪个模块负责这个点的口径）与 risk_level（动钱/动治理的标 high）。
--
-- 为什么住在清单表而不是代码：清单的真相源就是 common.permission（Authorizer 启动双向比对），
-- 元数据跟着清单走，加权限点的一次迁移里顺手写全两列，不会出现"代码里有枚举、库里没元数据"的漂移。
-- 枚举里不重抄 risk_level——Java 侧不复制第二份真相源，与 description 同一纪律。
--
-- risk_level = 'high' 的硬约束：只许授 SUPER_ADMIN（员工侧）。Authorizer 启动时校验
-- staff.role_permission 违反即起不来——高危点被顺手授给普通岗位时，靠启动失败而不是 review 记性兜底。
--
-- high 的语义是「动钱出口收窄到一个人」，不是「看起来危险」：SHOP_GOVERNANCE 也是重动作，
-- 但它是 REVIEWER 的正常职责（商家治理本来就是审核岗在干），标 high 会和现实授权冲突。
-- 动钱的四个出口才符合「只有超管能碰」：退款、结算审批、对账视图、挂账处置。

-- owner 先加可空列、回填后再补 NOT NULL：清单表已有行，NOT NULL 必须跟在 backfill 后面，
-- 否则加列当场就炸（PG 对已有行立即校验）。
ALTER TABLE common.permission
    ADD COLUMN owner text,
    ADD COLUMN risk_level text NOT NULL DEFAULT 'normal'
        CONSTRAINT ck_permission_risk_level CHECK (risk_level IN ('normal', 'high'));

COMMENT ON COLUMN common.permission.owner IS '该权限点口径所属的模块（治理用，谁负责清洗与下线）';
COMMENT ON COLUMN common.permission.risk_level IS 'normal / high；high = 动钱或动治理，员工侧只许 SUPER_ADMIN（启动校验）';

-- owner 按模块归属；high 标 5 个动钱/动治理的出口
UPDATE common.permission SET owner = 'trade' WHERE code IN ('order:read', 'order:refund');
UPDATE common.permission SET owner = 'catalog' WHERE code IN ('product:read', 'product:write');
UPDATE common.permission SET owner = 'seller' WHERE code IN ('shop:read', 'staff:manage', 'shipping:manage');
UPDATE common.permission SET owner = 'clearing' WHERE code IN ('finance:read', 'settlement:approve');
UPDATE common.permission SET owner = 'catalog' WHERE code IN ('CATEGORY_MANAGE', 'PRODUCT_REVIEW');
UPDATE common.permission SET owner = 'cms' WHERE code = 'CMS_MANAGE';
UPDATE common.permission SET owner = 'seller' WHERE code IN ('SHOP_REVIEW', 'SHOP_GOVERNANCE');
UPDATE common.permission SET owner = 'logistics' WHERE code = 'LOGISTICS_MANAGE';
UPDATE common.permission SET owner = 'promotion' WHERE code IN ('COUPON_OPS', 'PROMOTION_MANAGE');
UPDATE common.permission SET owner = 'clearing' WHERE code = 'LEDGER_VIEW';
UPDATE common.permission SET owner = 'payment' WHERE code = 'SUSPENSE_MANAGE';
UPDATE common.permission SET owner = 'audit' WHERE code = 'AUDIT_VIEW';
UPDATE common.permission SET owner = 'trust' WHERE code = 'TRUST_REVIEW';
UPDATE common.permission SET owner = 'infra' WHERE code IN ('JOB_TRIGGER', 'RUM_VIEW', 'EVENT_REPLAY');

UPDATE common.permission SET risk_level = 'high'
WHERE code IN ('order:refund', 'settlement:approve', 'LEDGER_VIEW', 'SUSPENSE_MANAGE');

-- 回填完成再上 NOT NULL：此后新权限点的迁移漏写 owner 直接失败，元数据不会缺
ALTER TABLE common.permission ALTER COLUMN owner SET NOT NULL;
