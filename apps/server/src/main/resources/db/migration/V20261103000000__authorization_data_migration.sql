SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 存量搬迁：`seller.role*` / `operator_role` / `operator_shop` → `authz.*`
--
-- **只搬不删。** 旧的四张表在这条迁移里保持原样，解析器还在读它们——所以这一条跑完，
-- 应用行为一个字节都不变，`authz.*` 里只是多了一份内容完全相同的副本。
--
-- 删表放在下一步（解析器切过去之后），因为在同一条迁移里既搬又删，一旦解析器有问题就
-- 没有退路了。**顺序是"搬 → 切读 → 删"，不是"搬+删 → 切"。**
--
-- 主账号不产生授权行：它的权限集恒等于清单里 `pool` 含 merchant 的全部码
-- （{@code Permission.merchantPoolCodes()}），店铺范围恒等于本商家的全部店。
-- 把它落成数据行只会多一份需要同步的副本——新开一个店就得记得补一行。
-- ─────────────────────────────────────────────────────────────────────────────

-- 角色：商家自建的角色，owner 就是 merchant
INSERT INTO authz.role (id, owner_kind, owner_id, code, name, builtin, status, created_at)
SELECT r.id, 'merchant', r.merchant_id, r.code, r.name, false, 'active', r.created_at
FROM seller.role r
ON CONFLICT DO NOTHING;

-- 角色 → 权限码
INSERT INTO authz.role_permission (role_id, permission_code)
SELECT rp.role_id, rp.permission_code
FROM seller.role_permission rp
ON CONFLICT DO NOTHING;

-- 授权：operator_role × operator_shop 展开成"一行一个范围"。
-- 一个角色授权了 3 个店 = 3 行——撤销单个店是标记一行，不是改数组。
-- 没有任何授权店的子账号不产生行：空集是"什么都碰不了"，不是"不限"。
INSERT INTO authz.role_grant
    (subject_type, subject_id, role_id, scope_kind, scope_shop_id,
     granted_by_type, granted_by_id, granted_at)
SELECT 'seller', orl.operator_id, orl.role_id, 'shop', ops.shop_id,
       'seller', owner.owner_id, o.created_at
FROM seller.operator_role orl
JOIN seller.operator o ON o.id = orl.operator_id AND o.is_primary = false
JOIN seller.operator_shop ops ON ops.operator_id = orl.operator_id
JOIN LATERAL (
    -- 授予人：该商家的主账号。迁移出来的行没有真实的授予事件，用主账号是最不坏的选择。
    SELECT p.id AS owner_id FROM seller.operator p
     WHERE p.merchant_id = o.merchant_id AND p.is_primary
     LIMIT 1
) owner ON true
ON CONFLICT DO NOTHING;

COMMENT ON TABLE seller.role IS
    '【待退役】已复制到 authz.role。解析器切过去之后这条表连同 operator_role/operator_shop 一起删';
