-- V75: 卖家子账号独立凭证（docs/subaccount-rework-plan.md 阶段一）
--
-- 与旧模型的区别：此前「子账号」= 一个普通买家账号（手机号即身份）+ 一条 shop.shop_members 关系，
-- 工作身份与私人身份共用一套凭证。本表把子账号升格为**第三种认证主体**（kind=subaccount）：
-- 自己的登录名 + 口令 + 绑定手机号，登录后自带店铺，与买家端账号体系互不相认。
--
--   * login_name：全局唯一（不拼店名）。与「店铺名:子账号名」的淘宝形状刻意不同——店名在
--     ACC-74 的重提流程里是**可改**的，登录名跟着店名漂等于员工下次就登不上
--   * status：PENDING_ACTIVATION 建号未激活 / ACTIVE 已激活 / DISABLED 停用（停用保留凭证，可解冻）
--   * phone + verified_at：激活锚点。手机号是平台的身份锚点（与买家同一套信任模型），不发身份证号
--     （敏感个人信息，合规成本远大于收益）。同店一个手机号只能激活一个子账号 → 唯一约束兜底
--   * permissions：被授予的权限码集（jsonb），OWNER 通配不落此列
--
-- 店铺侧不再有 MEMBER 成员行：授权真相一条链（凭证 → 权限码），不做两处存两处改。
-- shop.shop_members 只剩开店写入的 OWNER 行，继续承担「一人一店」名额与店铺归属判定。
--
-- 建表语句里的两处唯一约束与一处 CHECK 都写在 CREATE TABLE 内联：本表是全新建的，内联与事后
-- ALTER 等价，但事后 ALTER（尤其是 ADD CONSTRAINT 的 CHECK）在已有数据的大表上要扫全表并持锁，
-- 迁移 lint 对那个形状一律报警——形状本身就把「新表」与「存量表」混成一件事了。

-- 迁移级超时：任何一步卡在锁上都不许无限期挂住发布（口径见 .squawk.toml / docs/conventions/tooling.md）
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS account.shop_subaccounts (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    shop_id       UUID NOT NULL,                      -- 所属店铺（shop.shops.id），跨 schema 裸引用不加 FK
    login_name    VARCHAR(50) NOT NULL,               -- 登录名，全局唯一（登录时无店可选，故必须全局唯一）
    password_hash VARCHAR(100) NOT NULL,              -- BCrypt 摘要；初始口令由店主设置，激活后员工可自查改
    phone         VARCHAR(20) NOT NULL,               -- 绑定手机号（激活时短信验证的就是它）
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING_ACTIVATION',
    permissions   JSONB NOT NULL DEFAULT '[]',
    verified_at   TIMESTAMPTZ,                        -- 手机号验证通过时刻（追责锚点）；未激活为 NULL
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 登录名全局唯一：登录入口只吃登录名，撞键由 service 兜成同一个 400（先查后插挡不住并发）
    CONSTRAINT uk_shop_subaccounts_login_name UNIQUE (login_name),

    -- 同店一个手机号只能有一个子账号（含未激活与已停用）：激活要按号码发短信，一号一账号才谈得上
    -- 「验证的是本人」。左前缀 shop_id 同时覆盖「查某店全部子账号」，无需单列索引
    CONSTRAINT uk_shop_subaccounts_shop_phone UNIQUE (shop_id, phone),

    -- 激活态必须已经验过号，反之未验号的行不许是 ACTIVE。不这么钉的话，「跳过激活直接可用」这种写错
    -- 只会表现为某个接口悄悄放行，而不是一条写不进去的行
    CONSTRAINT ck_shop_subaccounts_activation CHECK (status <> 'ACTIVE' OR verified_at IS NOT NULL)
);
