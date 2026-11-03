SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 授权模型：角色 / 角色权限 / 授权（带范围与时限）
--
-- 三件事在这里定型，都是前面讨论的结论：
--
--   1. **范围挂在"授权"上，不挂在角色或主体上。**
--      挂角色上 → 角色数 = 岗位数 × 店数爆炸；挂主体上 → "在店 A 是客服、在店 B 是运营"
--      表达不了。`authz.role_grant` 是范围唯一可行的位置。
--
--   2. **一行一个范围，不是一行带一个集合。**
--      "客服调岗，把他从店 B 摘掉"是高频操作：一行一个范围时撤销 = 标记一行；
--      一行带集合要读-改-写，并发下互相覆盖。唯一约束还让重复授权天然幂等。
--      代价是"一次授权 3 个店 = 3 行"，这个代价由审计吸收——授权表存结果，审计存事件。
--
--   3. **`scope_kind` 是显式的，不用"无子行 = 不限"。**
--      后者的危险是"忘了写范围"和"故意不限"长得一样，求值时静默全放开。
--      `all` 表示"这个商家/这个平台的全部"——**符号值，不枚举**，
--      枚举会在新开店时漏掉，而平台侧根本枚举不完。
--
-- 库里不存"有哪些权限码"：那是 `contracts/permissions.yaml` 的事，由 `Permission` 枚举承载。
-- 这里只存"谁在什么范围持有哪个角色"这个事实。
--
-- 本迁移只建表，不搬存量：`seller.operator_role` / `seller.operator_shop` /
-- `staff.role_permission` 仍由现有解析器读取，切换到 `authz.*` 是下一步。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS authz;
COMMENT ON SCHEMA authz IS '授权模型：角色、角色权限、带范围与时限的授权';

CREATE TABLE authz.role
(
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    owner_kind        text        NOT NULL,
    -- merchant 角色的 owner_id 是 merchant_id；平台角色为空（只有一个平台）
    owner_id          uuid,
    code              text        NOT NULL,
    name              text        NOT NULL,
    -- 这个角色能批准的退款上限。NULL = 不设上限，**只有内置店长角色**是这种：
    -- 允许商家自己填 NULL，等于"勾了退款但忘填上限 → 静默无限授权"。
    max_refund_amount bigint,
    -- 内置角色不可归档、不可改权限点（平台岗位与店长）
    builtin           boolean     NOT NULL DEFAULT false,
    status            text        NOT NULL DEFAULT 'active',
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_role_owner_kind CHECK (owner_kind IN ('platform', 'merchant')),
    CONSTRAINT ck_role_status CHECK (status IN ('active', 'archived')),
    CONSTRAINT ck_role_cap CHECK (max_refund_amount IS NULL OR max_refund_amount > 0),
    -- 平台角色没有 owner，商家角色必须有；两者不能混
    CONSTRAINT ck_role_owner CHECK (
        (owner_kind = 'platform' AND owner_id IS NULL) OR
        (owner_kind = 'merchant' AND owner_id IS NOT NULL))
);

-- 同一作用域内 code 唯一。平台角色的 owner_id 为 NULL，`COALESCE` 成零 uuid 才能进唯一索引
-- （Postgres 的唯一索引里 NULL 互不相等，不折叠就等于没约束）。
CREATE UNIQUE INDEX uq_role_code ON authz.role
    (owner_kind, COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
    WHERE status = 'active';

COMMENT ON TABLE authz.role IS '角色。平台角色是内置岗位，商家角色可自助建；max_refund_amount 是唯一的属性阈值';

-- 角色 → 权限码。permission_code 不加外键：清单活在 yaml 里，库里没有可指向的表。
-- 一致性由 Authorizer 启动校验兜——库里出现清单外的码，应用起不来。
CREATE TABLE authz.role_permission
(
    role_id         uuid NOT NULL,
    permission_code text NOT NULL,

    CONSTRAINT pk_role_permission PRIMARY KEY (role_id, permission_code)
);

COMMENT ON TABLE authz.role_permission IS
    '角色持有的权限码。启动校验：码必须 ⊆ contracts/permissions.yaml；商家角色必须 ⊆ assignable 集合';

-- 授权：谁、在哪个范围、持有哪个角色、谁给的、到什么时候。
--
-- 这三样（范围 / 授予人 / 时限）天然同表，不是巧合：它们都是"授权"这个事件的属性。
-- 分开建表就得靠 id 关联，而那份关联本身没有不变式可守。
CREATE TABLE authz.role_grant
(
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    -- 与 infra.security.CurrentOperator 的类型常量同值：'seller' / 'staff'。
    -- 买家不进这张表——买家的边界是 buyer_id 列绑定，不是授权。
    subject_type    text        NOT NULL,
    subject_id      uuid        NOT NULL,
    role_id         uuid        NOT NULL,

    -- 'all' = 该主体的全场（商家：本商家所有店；平台：全平台）。符号值，不枚举。
    -- 'shop' = 仅 scope_shop_id 这一个店。
    scope_kind      text        NOT NULL,
    scope_shop_id   uuid,

    granted_by_type text        NOT NULL,
    granted_by_id   uuid        NOT NULL,
    granted_at      timestamptz NOT NULL DEFAULT now(),

    -- 临时授权到期自动失效；撤销写时间戳，**不删行**——审计要能回答
    -- "某个历史时间点这个人有什么权限"，DELETE 会让这个问题永远无解。
    valid_to        timestamptz,
    revoked_at      timestamptz,
    revoked_by_type text,
    revoked_by_id   uuid,
    revoked_reason  text,

    CONSTRAINT ck_grant_subject_type CHECK (subject_type IN ('seller', 'staff')),
    CONSTRAINT ck_grant_scope_kind CHECK (scope_kind IN ('all', 'shop')),
    CONSTRAINT ck_grant_scope CHECK (
        (scope_kind = 'all' AND scope_shop_id IS NULL) OR
        (scope_kind = 'shop' AND scope_shop_id IS NOT NULL))
);

-- 同一主体 + 同一角色 + 同一范围，只许一条有效授权（重复授权天然幂等）。
-- `all` 的 scope_shop_id 为 NULL，同样要折叠成零 uuid 才能进唯一索引。
CREATE UNIQUE INDEX uq_grant_scope ON authz.role_grant
    (subject_type, subject_id, role_id, scope_kind,
     COALESCE(scope_shop_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE revoked_at IS NULL;

-- 每请求的求值走这条：给定主体，取出全部有效授权。
CREATE INDEX idx_grant_subject ON authz.role_grant (subject_type, subject_id, scope_kind)
    WHERE revoked_at IS NULL;

COMMENT ON TABLE authz.role_grant IS
    '授权：主体 × 角色 × 范围，带授予人与时限。范围是符号值（all / shop），不枚举具体行';

-- 属性切面：类目范围。与店的集合是 **AND**。
-- 只有 product（审核）与 governance_clue（处置）用得到，且只给平台侧。
-- 无行 = 该维度不限——这里是安全的，因为它只会收窄，不会放开（与店范围相反）。
CREATE TABLE authz.role_grant_category
(
    grant_id    uuid NOT NULL,
    category_id uuid NOT NULL,

    CONSTRAINT pk_role_grant_category PRIMARY KEY (grant_id, category_id)
);

COMMENT ON TABLE authz.role_grant_category IS
    '类目切面。与店集合 AND：无行表示该类目维度不限（只收窄不放开，所以"无行=不限"是安全的）';

-- 岗位权限改由清单推导（{@code contracts/permissions.yaml} 的 {@code staff_roles}），
-- 种子行退役。留下的直接后果：种子漏同步是静默失权，表被清空是全体失权。
DROP TABLE IF EXISTS staff.role_permission;
