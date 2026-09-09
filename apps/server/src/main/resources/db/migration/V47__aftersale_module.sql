-- V47: 售后独立成 aftersale 模块 —— 售后单从 orders 表三列升格为 aftersale.tickets + ticket_events
-- 原状是 orders 上 after_sale_status / after_sale_type / refund_amount 等列：一单只能有一次售后、无协商时间线、
-- 售后状态机与订单状态机挤在 OrderTransitionService 一个类里。目标：售后单是独立聚合，
-- 一单可多次申请（同一时刻至多一张进行中）、每个动作留一条时间线。
-- orders 保留两列作投影：after_sale_status（最近一张单的状态，供订单列表/详情展示，aftersale 经 order :: api 写回）
-- 与 refund_amount（退款口径汇总）；apply_expire_at 是订单自己的售后申请窗口，仍归 order。

CREATE SCHEMA IF NOT EXISTS aftersale;

CREATE TABLE IF NOT EXISTS aftersale.tickets (
    id                       UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id                 UUID NOT NULL,                       -- orders.orders.id，跨 schema 裸引用不加 FK
    user_id                  UUID NOT NULL,                       -- 买家（申请人）
    shop_id                  UUID NOT NULL,                       -- 卖家店铺（处理方）
    order_item_id            UUID,                                -- 行项售后预留；NULL = 整单售后（V1 只有整单）
    type                     VARCHAR(20) NOT NULL CHECK (type IN ('REFUND_ONLY', 'RETURN_REFUND')),
    status                   VARCHAR(20) NOT NULL CHECK (status IN ('APPLYING', 'RETURNING', 'REFUNDED', 'REJECTED', 'CLOSED')),
    reason                   VARCHAR(200),                        -- 买家申请理由
    refund_amount            BIGINT CHECK (refund_amount >= 0),   -- 退款口径（分），V1 = 整单实付
    currency                 VARCHAR(3) NOT NULL DEFAULT 'CNY',
    return_logistics_company VARCHAR(32),                         -- 退货退款：买家回寄物流
    return_tracking_no       VARCHAR(64),
    refunded_at              TIMESTAMPTZ,                         -- 退款完成时刻（REFUNDED 时回填）
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_order ON aftersale.tickets(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_shop_status ON aftersale.tickets(shop_id, status);
-- 同一订单同一时刻至多一张进行中的售后单：并发重复申请由唯一索引兜底（应用层抓 DuplicateKey 报 409）
CREATE UNIQUE INDEX IF NOT EXISTS uk_tickets_open_per_order ON aftersale.tickets(order_id)
    WHERE status IN ('APPLYING', 'RETURNING');

CREATE TABLE IF NOT EXISTS aftersale.ticket_events (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
    ticket_id  UUID NOT NULL,                                     -- aftersale.tickets.id
    actor      VARCHAR(10) NOT NULL,                              -- BUYER / SELLER
    action     VARCHAR(40) NOT NULL,                              -- TicketAction 的 name()
    note       VARCHAR(200),                                      -- 申请理由 / 回寄物流 等
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON aftersale.ticket_events(ticket_id, created_at);

-- 一次性搬迁：orders 上已有的售后落成一张单，order_status_log 里的售后动作落成时间线（迁移脚本层面跨 schema 读一次）
INSERT INTO aftersale.tickets
    (order_id, user_id, shop_id, type, status, refund_amount, currency, return_logistics_company, return_tracking_no,
     refunded_at, created_at, updated_at)
SELECT id, user_id, shop_id, after_sale_type, after_sale_status, COALESCE(refund_amount, pay_amount), currency,
       return_logistics_company, return_tracking_no, after_sale_refunded_at, updated_at, updated_at
FROM orders.orders
WHERE after_sale_status <> 'NONE' AND after_sale_type IS NOT NULL;

INSERT INTO aftersale.ticket_events (ticket_id, actor, action, note, created_at)
SELECT t.id, l.actor_type, l.action, l.reason, l.created_at
FROM orders.order_status_log l
JOIN aftersale.tickets t ON t.order_id = l.order_id
WHERE l.action LIKE 'AFTER_SALE_%';

DELETE FROM orders.order_status_log WHERE action LIKE 'AFTER_SALE_%';

-- orders 只留投影列 after_sale_status / refund_amount 与窗口列 apply_expire_at，其余售后列随单据搬走
ALTER TABLE orders.orders
    DROP COLUMN IF EXISTS after_sale_type,
    DROP COLUMN IF EXISTS after_sale_refunded_at,
    DROP COLUMN IF EXISTS return_logistics_company,
    DROP COLUMN IF EXISTS return_tracking_no;
