-- V56: 优惠券独立成 coupon 模块 —— 券模板（运营配置的规则）+ 用户券（领取后持有的实例）+ 核销流水
--
-- 生效规则见 docs/business-rules/coupon.md（CPN-01、CPN-02、CPN-15、CPN-17）。与表结构直接相关的几条定案：
-- * 模板与实例分离：规则在模板；用户券在领取时把券名/面额/门槛/有效期固化成绝对值。模板事后可改可删，已发出的券不变
--   （这是本模块唯一不可动摇的约束：运营改配置不能让历史数据跟着变）。
-- * 一期只做店铺券（shop_id 非空，范围 = 本店全部商品）——与「按店拆单」天然对齐，零分摊。平台券/跨店分摊在三期。
-- * 一期只做「满 threshold 减 discount」（threshold = 0 即无门槛）：折扣券要 rate + 封顶，运费券是另一套履约口径，
--   二者都在二期；届时加 type 判别列 + discount_rate/max_discount_amount 即可，属纯增量 ALTER。
-- * 每人每模板限领 1 张，靠 uk_user_coupons_template_user 唯一索引兜底，不做应用层判重；限领多张是二期。
-- * 有效期一期只有绝对区间，领取时复制到 user_coupons 的 effective_at/expire_at。

CREATE SCHEMA IF NOT EXISTS coupon;

CREATE TABLE IF NOT EXISTS coupon.coupon_templates (
    id               UUID PRIMARY KEY DEFAULT uuidv7(),
    shop_id          UUID NOT NULL,                                              -- shop.shops.id，跨 schema 裸引用不加 FK
    name             VARCHAR(60) NOT NULL,
    threshold_amount BIGINT NOT NULL DEFAULT 0 CHECK (threshold_amount >= 0),    -- 门槛（分），0 = 无门槛
    discount_amount  BIGINT NOT NULL CHECK (discount_amount > 0),                -- 减免额（分）
    currency         VARCHAR(3) NOT NULL DEFAULT 'CNY',
    -- 承担方：一期只有店铺券（恒 SELLER）。列先立住是为了让 order 的券快照从券侧取到值，
    -- 而不是在 order 里硬编码 SELLER —— 平台券落地时只改这里，不动 order 的取数逻辑。
    bearer           VARCHAR(20) NOT NULL DEFAULT 'SELLER' CHECK (bearer IN ('SELLER', 'PLATFORM')),
    valid_from       TIMESTAMPTZ NOT NULL,                                       -- 绝对有效期起点
    valid_to         TIMESTAMPTZ NOT NULL,                                       -- 绝对有效期终点
    total_quantity   INT NOT NULL CHECK (total_quantity > 0),                    -- 发放总量
    issued_quantity  INT NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),        -- 已发放数：领券走条件更新 WHERE issued < total 防超发
    status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STOPPED')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_coupon_templates_validity CHECK (valid_to > valid_from),
    CONSTRAINT ck_coupon_templates_issued CHECK (issued_quantity <= total_quantity)
);

-- 卖家券管理列表：本店按创建时间倒序
CREATE INDEX IF NOT EXISTS idx_coupon_templates_shop ON coupon.coupon_templates(shop_id, created_at DESC);

-- 用户券：领取后的实例。规则字段是领取瞬间的快照，读券路径完全不碰模板。
--
-- order_id 是「本券当前关联的订单」，随状态改变含义（LOCKED = 占用的单，USED = 核销的单）：
-- 刻意不做 locked_order_id + used_order_id 两列——那会让「本券关联哪笔订单」有两个真相，
-- 判定「这单用了哪张券」（退券要按订单反查）就得两列都试。历史轨迹由 coupon_usages 流水承载，不靠这几列回放。
CREATE TABLE IF NOT EXISTS coupon.user_coupons (
    id               UUID PRIMARY KEY DEFAULT uuidv7(),
    template_id      UUID NOT NULL,                                              -- coupon.coupon_templates.id
    user_id          UUID NOT NULL,                                              -- account.users.id
    shop_id          UUID NOT NULL,                                              -- 冗余券归属店：券包按店展示免回查模板
    -- ---- 领取即固化的规则快照 ----
    name             VARCHAR(60) NOT NULL,                                       -- 券名快照：模板改名/下架不影响已领券的展示
    threshold_amount BIGINT NOT NULL CHECK (threshold_amount >= 0),
    discount_amount  BIGINT NOT NULL CHECK (discount_amount > 0),
    currency         VARCHAR(3) NOT NULL DEFAULT 'CNY',
    bearer           VARCHAR(20) NOT NULL DEFAULT 'SELLER' CHECK (bearer IN ('SELLER', 'PLATFORM')),  -- 承担方快照
    effective_at     TIMESTAMPTZ NOT NULL,
    expire_at        TIMESTAMPTZ NOT NULL,
    -- ---- 状态机：UNUSED → LOCKED → USED；UNUSED → EXPIRED / VOID。LOCKED 不可省（见 coupon.md §4） ----
    status           VARCHAR(20) NOT NULL DEFAULT 'UNUSED'
                     CHECK (status IN ('UNUSED', 'LOCKED', 'USED', 'EXPIRED', 'VOID')),
    source           VARCHAR(20) NOT NULL DEFAULT 'CLAIM' CHECK (source IN ('CLAIM', 'REFUND_RETURN')),
    order_id         UUID,                                                       -- LOCKED / USED 时非空
    locked_at        TIMESTAMPTZ,
    used_at          TIMESTAMPTZ,
    applied_discount_amount BIGINT CHECK (applied_discount_amount >= 0),         -- 本单实际减免额（分）：封顶后可能小于面额
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_user_coupons_validity CHECK (expire_at > effective_at),
    -- 状态与订单引用必须自洽：占用的必有单有额有时刻，可再用的必无单无额。半份状态由 DB 拦下，不靠调用方自觉。
    -- 实际减免额（而非面额）记在这里：满减券封顶于商品额，面额 100 用在 50 元单上实减 50，流水与对账要的是 50。
    CONSTRAINT ck_user_coupons_order_ref CHECK (
        (status = 'LOCKED' AND order_id IS NOT NULL AND locked_at IS NOT NULL
            AND applied_discount_amount IS NOT NULL)
        OR (status = 'USED' AND order_id IS NOT NULL AND used_at IS NOT NULL
            AND applied_discount_amount IS NOT NULL)
        OR (status IN ('UNUSED', 'EXPIRED', 'VOID') AND order_id IS NULL
            AND applied_discount_amount IS NULL)
    )
);

-- 每人每模板限领 1 张：并发重复领取撞唯一索引（应用层抓 DuplicateKey 报 409）。
-- 部分索引只装 CLAIM —— REFUND_RETURN 是退款补偿，不受限领约束，否则用户原券还在手上时退券会直接撞索引插不进去。
-- 这也正好落实「退券不恢复每人限领额度」：补偿不占名额，也不能被拿来再薅一次。
CREATE UNIQUE INDEX IF NOT EXISTS uk_user_coupons_template_user ON coupon.user_coupons(template_id, user_id)
    WHERE source = 'CLAIM';

-- 我的券包：按用户倒序翻页；status 可选筛选（券包页签）
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON coupon.user_coupons(user_id, created_at DESC);
-- 结算页按店取券：一次结算可能拆多店，逐店取「我在本店未使用的券」
CREATE INDEX IF NOT EXISTS idx_user_coupons_user_shop ON coupon.user_coupons(user_id, shop_id);
-- 过期收敛任务扫描：只扫未使用的券 —— LOCKED 的券下单时已定格优惠，不能因为过期而让已下单的支付失败
CREATE INDEX IF NOT EXISTS idx_user_coupons_expire ON coupon.user_coupons(expire_at) WHERE status = 'UNUSED';
-- 按订单反查本单占用/核销的券（取消释放、支付核销、退款退券都走这条路）
CREATE INDEX IF NOT EXISTS idx_user_coupons_order ON coupon.user_coupons(order_id) WHERE order_id IS NOT NULL;

-- 核销流水（append-only 账本，无 updated_at）：谁、何时、因哪笔订单、动了哪张券、减了多少。
-- 一张券的完整轨迹是 LOCK → USE，或 LOCK → RELEASE（取消/超时）；退款回退记 RETURN。
-- 只靠 user_coupons 的状态列回放不出历史（取消后改单再核销就分不清了），流水才是账。
CREATE TABLE IF NOT EXISTS coupon.coupon_usages (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    user_coupon_id  UUID NOT NULL,                                               -- coupon.user_coupons.id
    order_id        UUID NOT NULL,                                               -- 本动作关联的订单
    user_id         UUID NOT NULL,
    shop_id         UUID NOT NULL,
    action          VARCHAR(10) NOT NULL CHECK (action IN ('LOCK', 'USE', 'RELEASE', 'RETURN')),
    discount_amount BIGINT NOT NULL CHECK (discount_amount >= 0),                -- 本次动作涉及的减免额（分）；RELEASE/RETURN 记原额便于对账
    currency        VARCHAR(3) NOT NULL DEFAULT 'CNY',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon.coupon_usages(user_coupon_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_order ON coupon.coupon_usages(order_id);
