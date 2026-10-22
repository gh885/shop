SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 买家账号。与 seller.operator、平台 staff 是三套独立身份，不共用表。
--
-- 合成一张 user 表 + user_type 是最常见的错：最后每个查询里都在 if (type == 'seller')。
-- 三端各自的登录、令牌、注销全部分开，共用的只有权限点清单那一份。
--
-- 登录方式：现在只开「手机号 + 密码」。这不是终态——真实电商走手机号 + 短信验证码，
-- 但那需要 notification 模块先有短信通道。login_binding 就是给后面外采的登录方式留的位置：
-- 微信 / 支付宝 / 短信 各是一行 (provider, external_id)，buyer 表一个字段都不用动。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS account;

COMMENT ON SCHEMA account IS '买家账号：主体自建，登录方式外采';

CREATE TABLE account.buyer
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    phone         text        NOT NULL,
    password_hash text        NOT NULL,
    nickname      text        NOT NULL,
    status        text        NOT NULL DEFAULT 'active',
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_buyer_phone UNIQUE (phone),
    CONSTRAINT ck_buyer_status CHECK (status IN ('active', 'disabled')),
    -- 手机号是买家唯一的对外标识，格式错了后面短信、找回密码全是坑，这里一次钉死
    CONSTRAINT ck_buyer_phone CHECK (phone ~ '^1[0-9]{10}$')
);

COMMENT ON TABLE account.buyer IS '买家账号主体；停用靠 status，不删行——订单要能一直指回人';

CREATE INDEX idx_buyer_created ON account.buyer (created_at DESC);

-- 第三方登录绑定。现在是空的，建出来是因为它决定 buyer 表的形状：
-- 有这张表，加微信登录不用给 buyer 加列；没有它，迟早会长出 wechat_open_id / alipay_user_id 这种列。
CREATE TABLE account.login_binding
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    buyer_id    uuid        NOT NULL,
    provider    text        NOT NULL,
    external_id text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- 一个外部账号只能绑一个买家，否则登录时分不清是谁
    CONSTRAINT uq_login_binding UNIQUE (provider, external_id),
    CONSTRAINT ck_login_binding_provider CHECK (provider IN ('phone', 'wechat', 'alipay', 'apple'))
);

COMMENT ON TABLE account.login_binding IS '外部身份 → 买家。provider 决定 external_id 的含义，换渠道不加列';

CREATE INDEX idx_login_binding_buyer ON account.login_binding (buyer_id);
