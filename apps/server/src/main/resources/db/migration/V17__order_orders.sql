-- V17: Order 模块 — orders 订单主表 + items 行项目快照表
-- 归属：交易核心数据。schema 取复数 orders，避开 PG 保留字 order（否则一切 SQL 都要手工加引号）
-- 拆单：多店铺平台，一次结算按店铺拆成 N 单（无父子两层），每单 items 同属一家店
-- 快照：商品展示信息 / 单价 / 收货地址在下单瞬间定格，之后改价、改名、删地址均不影响旧订单
-- 库存：本模块不写 product.skus（模块隔离），下单/取消发领域事件由 product 模块自行增减

CREATE SCHEMA IF NOT EXISTS orders;

CREATE TABLE IF NOT EXISTS orders.orders (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    order_no      VARCHAR(32) NOT NULL,            -- 业务单号（对外展示/客服对账），与 UUID 主键分离
    user_id       UUID NOT NULL,                   -- 买家，auth.users.id，跨 schema 裸引用不加 FK
    shop_id       UUID NOT NULL,                   -- 卖家店铺，shop.shops.id，裸引用不加 FK
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT'
                  CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED')),
                  -- 待付款 → 待发货 → 已发货 → 已完成；待付款/待发货可取消
    item_amount   BIGINT NOT NULL CHECK (item_amount >= 0),              -- 商品总额（Σ 行小计），分
    shipping_fee  BIGINT NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),   -- 运费，分（V1 未接计费恒 0）
    pay_amount    BIGINT NOT NULL CHECK (pay_amount >= 0),               -- 应付总额，分
    currency      VARCHAR(3) NOT NULL DEFAULT 'CNY',

    -- 收货快照：镜像 user_profile.addresses（前缀 receiver 区分买卖双方），只读还原，永不更新
    receiver_name     VARCHAR(30) NOT NULL,
    receiver_phone    VARCHAR(20) NOT NULL,
    receiver_province VARCHAR(30) NOT NULL,
    receiver_city     VARCHAR(30) NOT NULL,
    receiver_district VARCHAR(30) NOT NULL,
    receiver_detail   VARCHAR(120) NOT NULL,

    buyer_message VARCHAR(200),                    -- 买家留言，可空

    -- 物流（发货时回填；一单一包裹，多包裹时再拆 shipments 表）
    logistics_company VARCHAR(50),
    tracking_no       VARCHAR(64),

    -- 状态时间戳：单路径流转，列比流水表够用；取消原因超时关单写固定文案
    paid_at        TIMESTAMPTZ,
    shipped_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    cancelled_at   TIMESTAMPTZ,
    cancel_reason  VARCHAR(200),
    pay_expire_at  TIMESTAMPTZ NOT NULL,           -- 待付款截止时刻，超时自动关单的扫描依据

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 应付口径钉死在 DB：应付 = 商品 + 运费（将来上优惠券加 discount 列时同步换 CHECK）
    CONSTRAINT ck_orders_pay_amount CHECK (pay_amount = item_amount + shipping_fee)
);

-- 业务单号全局唯一；订单号是人对外报的，UUID 是库内身份
CREATE UNIQUE INDEX IF NOT EXISTS uk_orders_order_no ON orders.orders(order_no);

-- 「我的订单」列表：按用户倒序分页，左前缀覆盖各状态 tab 筛选（user_id 过滤后基数很小）
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders.orders(user_id, created_at DESC);

-- 商家工作台订单列表
CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON orders.orders(shop_id, created_at DESC);

-- 超时关单扫描：部分索引只装待付款单，任务扫的全集即索引全集
CREATE INDEX IF NOT EXISTS idx_orders_pay_expire ON orders.orders(pay_expire_at)
    WHERE status = 'PENDING_PAYMENT';

CREATE TABLE IF NOT EXISTS orders.items (
    id             UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id       UUID NOT NULL,                  -- 所属订单，orders.orders.id（同 schema 关系由应用层保证）
    product_id     UUID NOT NULL,                  -- product.products.id（SPU），评价/再次购买定位，裸引用不加 FK
    sku_id         UUID NOT NULL,                  -- product.skus.id，裸引用不加 FK
    name           VARCHAR(128) NOT NULL,          -- SKU 展示名快照（SPU 名 + 规格值），改名不影响旧单
    image          VARCHAR(255),                   -- 图片快照：下单时已解析好（SKU 图空则回落 SPU 主图），读端零逻辑
    price          BIGINT NOT NULL CHECK (price >= 0),                 -- 成交单价快照，分
    original_price BIGINT CHECK (original_price >= 0),                 -- 划线价快照，可空
    currency       VARCHAR(3) NOT NULL DEFAULT 'CNY',
    quantity       INT NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    amount         BIGINT NOT NULL CHECK (amount >= 0),                -- 行小计，分，落库固化免读时重算
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- 行小计口径钉死：小计 = 单价 × 数量
    CONSTRAINT ck_order_items_amount CHECK (amount = price * quantity)
);

-- 同 SKU 合并为一行（与购物车合并行为一致）；左前缀覆盖「拉某单全部行项」这一唯一高频查询
CREATE UNIQUE INDEX IF NOT EXISTS uk_order_items_order_sku ON orders.items(order_id, sku_id);

-- 反查：某 SKU 的历史成交（评价校验「买过才能评」、销量统计）
CREATE INDEX IF NOT EXISTS idx_order_items_sku_id ON orders.items(sku_id);
