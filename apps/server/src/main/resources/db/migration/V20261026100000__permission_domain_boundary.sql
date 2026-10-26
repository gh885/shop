SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 权限清单收尾：加域边界、统一码形态、补两个缺口。
--
-- 三件事，每一件都对应一个真实踩到的坑：
--
-- 1. **加 domain 列。** 这是本迁移的主要目的。权限点原来只有「码」一个维度，于是
--    `SellerOperatorResolver` 给主账号授的是**整张 common.permission 表**——
--    一个卖家店主因此拿到了 SUSPENSE_MANAGE（手动退真钱）、LEDGER_VIEW（全平台余额）、
--    STAFF_MANAGE（管平台员工）。三类身份共用一份清单，却没有任何东西挡住跨域授予。
--
--    修法不是去改那一条 SQL（那是治标：下次换个地方又漏），是让「这个码属于哪个域」
--    成为数据。有了它，两件事变成可能：卖家侧只授 seller 域，以及 Authorizer 启动时
--    校验 role_permission 里没有跨域授予。
--
-- 2. **卖家域 9 个码从小写 `域:动作` 改成大写。** 同一个枚举里两种形态，意味着
--    「这个名字是干什么的」没有统一答案。改的是值不是语义。
--
-- 3. **补 owner 缺口 + 新权限点 BUYER_MANAGE。** V20261025210000 给 owner 加了 NOT NULL
--    并回填，但只覆盖当时已有的 19 个码；之后落地的 5 个各自补了 INSERT 却没写 owner——
--    从零重建库时那几个 INSERT 会当场失败。现在库里 24 行都有 owner，是「迁移顺序碰巧」
--    的结果，不是约束保证的。
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. domain 列 ─────────────────────────────────────────────────────────────
--
-- 先加可空列、回填、再上 NOT NULL：清单表已有行，直接 NOT NULL 会当场炸。
ALTER TABLE common.permission
    ADD COLUMN domain text
        CONSTRAINT ck_permission_domain CHECK (domain IN ('admin', 'seller'));

COMMENT ON COLUMN common.permission.domain IS
    '身份域：admin = 平台员工（staff.role_permission），seller = 店铺账号（seller.role_permission）。跨域授予由 Authorizer 启动校验拒绝';

-- 卖家域 9 个：原写法是小写 `域:动作`，先按旧值认出来
UPDATE common.permission SET domain = 'seller'
 WHERE code IN (
     'order:read', 'order:refund', 'product:read', 'product:write', 'shop:read',
     'staff:manage', 'finance:read', 'settlement:approve', 'shipping:manage'
 );
-- 其余全是 admin 域
UPDATE common.permission SET domain = 'admin' WHERE domain IS NULL;

ALTER TABLE common.permission ALTER COLUMN domain SET NOT NULL;

-- ── 2. 卖家域码形态统一 ───────────────────────────────────────────────────────
--
-- 顺序：先插新行 → 改授权表指向 → 删旧行。
--
-- 反过来（先删旧行）会在中间窗口里让枚举里的码在库中缺席，而 Authorizer 是启动时比对的——
-- 部署到一半重启就起不来。先插新行则任何时刻库里都是超集，启动校验只查「枚举 ⊆ 库」不会红。
--
-- **STAFF_MANAGE 特殊处理。** 它在两个域里都被用过：
--   · seller 域：店主管自己的客服（旧码 `staff:manage`）→ 改名为 SELLER_STAFF_MANAGE
--   · admin 域：平台管员工（枚举里一直就叫 STAFF_MANAGE）
-- 所以它不是「改名」，是「旧的那条属于 seller 域，另建一条 admin 域的同名码」。
-- 下面先按 seller 域插 SELLER_STAFF_MANAGE，再单独插 admin 域的 STAFF_MANAGE。
INSERT INTO common.permission (code, domain, owner, risk_level, description) VALUES
    ('ORDER_READ',           'seller', 'trade',    'normal', '查看本店订单与发货状态'),
    ('ORDER_REFUND',         'seller', 'trade',    'high',   '处理本店售后（同意 / 拒绝 / 确认退款）'),
    ('PRODUCT_READ',         'seller', 'catalog',  'normal', '查看本店商品（含草稿与被驳回的）'),
    ('PRODUCT_WRITE',        'seller', 'catalog',  'normal', '商品增删改、规格 SKU、提交挂售'),
    ('SHOP_READ',            'seller', 'seller',   'normal', '查看店铺经营数据'),
    ('SELLER_STAFF_MANAGE',  'seller', 'seller',   'normal', '管理本店子账号与角色'),
    ('FINANCE_READ',         'seller', 'clearing', 'normal', '查看本店资金流水与结算单'),
    ('SETTLEMENT_APPROVE',   'seller', 'clearing', 'high',   '审批结算单（商家侧确认批次金额）'),
    ('SHIPPING_MANAGE',      'seller', 'seller',   'normal', '运费模板（建、改、启用、归档）')
ON CONFLICT (code) DO NOTHING;

-- 授权表跟着改。seller.role_permission.permission_code 是裸 text（无外键），
-- 不改的话子账号的授权会指向一个已不存在的码——静默失效，比报错难查。
UPDATE seller.role_permission SET permission_code = 'ORDER_READ'          WHERE permission_code = 'order:read';
UPDATE seller.role_permission SET permission_code = 'ORDER_REFUND'        WHERE permission_code = 'order:refund';
UPDATE seller.role_permission SET permission_code = 'PRODUCT_READ'        WHERE permission_code = 'product:read';
UPDATE seller.role_permission SET permission_code = 'PRODUCT_WRITE'       WHERE permission_code = 'product:write';
UPDATE seller.role_permission SET permission_code = 'SHOP_READ'           WHERE permission_code = 'shop:read';
UPDATE seller.role_permission SET permission_code = 'SELLER_STAFF_MANAGE' WHERE permission_code = 'staff:manage';
UPDATE seller.role_permission SET permission_code = 'FINANCE_READ'        WHERE permission_code = 'finance:read';
UPDATE seller.role_permission SET permission_code = 'SETTLEMENT_APPROVE'  WHERE permission_code = 'settlement:approve';
UPDATE seller.role_permission SET permission_code = 'SHIPPING_MANAGE'     WHERE permission_code = 'shipping:manage';

DELETE FROM common.permission
 WHERE code IN (
     'order:read', 'order:refund', 'product:read', 'product:write', 'shop:read',
     'staff:manage', 'finance:read', 'settlement:approve', 'shipping:manage'
 );

-- 旧 `staff:manage` 删掉后，admin 域的 STAFF_MANAGE 还没人建——上面那批 INSERT 里没有它
-- （它有同名的 seller 旧码要处理，混在一起会因为主键冲突把整批吞掉）。
INSERT INTO common.permission (code, domain, owner, risk_level, description)
VALUES ('STAFF_MANAGE', 'admin', 'staff', 'normal', '平台员工与岗位管理（创建员工、分配岗位、禁用）')
ON CONFLICT (code) DO NOTHING;

-- 三个岗位里只有 SUPER_ADMIN 持有它（与迁移 V20261022112000 的授权一致，这里显式补上，
-- 因为上面那次 DELETE 可能连带清掉了 staff.role_permission 里的同名行）。
INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'STAFF_MANAGE'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'STAFF_MANAGE')
ON CONFLICT DO NOTHING;

-- ── 3. owner 缺口 + 新权限点 ─────────────────────────────────────────────────
UPDATE common.permission SET owner = 'catalog'    WHERE code = 'PRODUCT_REVIEW';
UPDATE common.permission SET owner = 'infra'      WHERE code IN ('JOB_TRIGGER', 'EVENT_REPLAY');
UPDATE common.permission SET owner = 'payment'    WHERE code = 'SUSPENSE_MANAGE';
UPDATE common.permission SET owner = 'governance' WHERE code = 'GOVERNANCE_REVIEW';

-- 封禁买家是平台治理动作，和「管理平台员工」是两件事：一个能动员工权限的人，
-- 不一定该能封买家号；合并的后果是员工管理的爆炸半径覆盖到全体买家。
INSERT INTO common.permission (code, domain, owner, risk_level, description)
VALUES ('BUYER_MANAGE', 'admin', 'account', 'normal', '买家账号封禁与解封（禁用后登录即拒，历史订单仍可查）')
ON CONFLICT (code) DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'BUYER_MANAGE'
WHERE EXISTS (SELECT 1 FROM common.permission WHERE code = 'BUYER_MANAGE')
ON CONFLICT DO NOTHING;

-- ── 4. 封号是治理动作，必须有账本 ─────────────────────────────────────────────
INSERT INTO audit.audit_action (action, subject, description)
VALUES ('account.buyer.status_changed', 'account', '买家账号封禁 / 解封')
ON CONFLICT (action) DO NOTHING;

-- ── 5. 跨域授予的兜底 ────────────────────────────────────────────────────────
--
-- 两件事都要有：**数据**（domain 列）挡将来，**清理**挡现在。
-- 这里把历史上已经错授出去的跨域授权删掉——不删的话，加了 domain 列也不会自己变干净。
--
-- 卖家侧不该持有任何 admin 域的点（反过来也一样：staff.role_permission 里
-- 不该出现 seller 域的点）。Authorizer 启动时会再校验一次，漏删就起不来。
DELETE FROM seller.role_permission rp
 USING common.permission p
 WHERE rp.permission_code = p.code
   AND p.domain = 'admin';

DELETE FROM staff.role_permission rp
 USING common.permission p
 WHERE rp.permission_code = p.code
   AND p.domain = 'seller';

-- 索引：启动校验要按域扫授权表，主键 (role, permission_code) 覆盖不到「按 domain 过滤」。
CREATE INDEX IF NOT EXISTS idx_permission_domain ON common.permission (domain);

COMMENT ON COLUMN common.permission.owner IS
    '该权限点口径所属的模块；新增权限点的迁移必须显式给值（NOT NULL 兜底，漏写插入即失败）';
