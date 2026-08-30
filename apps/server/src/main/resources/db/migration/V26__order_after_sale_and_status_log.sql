-- V26: 订单售后状态机 + 状态审计流水 + 补全时间驱动的超时契约
--
-- 履约与售后彻底分离：主状态机（status）停在履约闭环
-- PENDING_PAYMENT → PAID → SHIPPED → COMPLETED（+ CANCELLED），
-- 售后线（after_sale_status）接管「完成之后的交易纠葛」，两条线正交、互不挤占。
-- 资金态由 payment 模块的 payments.status 独立表达，订单只记「该退多少」（refund_amount）。
-- 状态集与合法转移的唯一真相在代码侧（order.model 的 OrderStatus / AfterSaleStatus），此处只落列与约束。

-- ---------- 1) 状态审计流水 ----------
-- 单一履约维度用订单上的时间戳列够用；叠加售后后一次纠葛有多个动作，时间戳列记不下中间过程。

CREATE TABLE IF NOT EXISTS orders.order_status_log (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id    UUID NOT NULL,                    -- orders.orders.id
    from_status VARCHAR(20),                      -- 转移前状态（首动作 CREATE 无前态）
    to_status   VARCHAR(20) NOT NULL,             -- 转移后状态（主状态或售后状态，同行必属同一状态机）
    action      VARCHAR(40) NOT NULL,             -- OrderAction: PAY/CANCEL/AUTO_CANCEL/SHIP/RECEIVE/AUTO_RECEIVE/AFTER_SALE_*
    actor_type  VARCHAR(20) NOT NULL,             -- OrderActor: BUYER / SELLER / SYSTEM
    reason      VARCHAR(200),                     -- 取消原因 / 售后理由等
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 回放某单全部状态历史（审计 / 客服排查）
CREATE INDEX IF NOT EXISTS idx_order_status_log_order ON orders.order_status_log(order_id, created_at);

-- ---------- 2) 订单表加售后列与超时截止列 ----------
-- 售后线：NONE → APPLYING →（REFUNDED / REJECTED / CLOSED）。卖家同意即退款（退款单据同事务落库），
-- 故没有「已同意待退款」的悬挂态。after_sale_type V1 只做仅退款，放开退货退款时再加 CHECK 取值。

ALTER TABLE orders.orders
    ADD COLUMN IF NOT EXISTS after_sale_status VARCHAR(20) NOT NULL DEFAULT 'NONE'
        CHECK (after_sale_status IN ('NONE', 'APPLYING', 'REFUNDED', 'REJECTED', 'CLOSED')),
    ADD COLUMN IF NOT EXISTS after_sale_type VARCHAR(20)
        CHECK (after_sale_type IN ('REFUND_ONLY')),
    ADD COLUMN IF NOT EXISTS refund_amount BIGINT                                  -- 退款金额口径（分），与 payments 资金态分离
        CHECK (refund_amount >= 0),
    ADD COLUMN IF NOT EXISTS after_sale_refunded_at TIMESTAMPTZ,                   -- 售后退款完成时刻
    ADD COLUMN IF NOT EXISTS apply_expire_at TIMESTAMPTZ,                          -- 售后申请截止（收货时回填）：过期申请被条件更新拒绝
    ADD COLUMN IF NOT EXISTS ship_expire_at TIMESTAMPTZ,                           -- 待发货截止（付款时回填）：到期自动取消并退款
    ADD COLUMN IF NOT EXISTS receive_expire_at TIMESTAMPTZ;                        -- 确认收货截止（发货时回填）：到期自动确认收货

-- 超时扫描的部分索引：全集即「该状态且过截止」的订单，与 idx_orders_pay_expire 同理。
-- apply_expire_at 不建索引：售后窗口靠申请时的条件更新（apply_expire_at > now）拦，没有扫描方。

CREATE INDEX IF NOT EXISTS idx_orders_ship_expire ON orders.orders(ship_expire_at)
    WHERE status = 'PAID';

CREATE INDEX IF NOT EXISTS idx_orders_receive_expire ON orders.orders(receive_expire_at)
    WHERE status = 'SHIPPED';
