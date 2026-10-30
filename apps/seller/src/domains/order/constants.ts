import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { DecisionFactTag, SaleDecisionKind } from "./after-sale-decision"

/**
 * 后端下发的状态词。**字面量必须与后端逐字一致**：
 * 订单展示态见 `SellerOrderQuery.DISPLAY_STATUSES`，售后单见 `Rma.CaseStatus.dbValue()`（小写蛇形）。
 * SDK 里这些字段是裸 `string`，词表只能住在这里。
 */
export const ORDER_STATUSES = [
    "pending_payment",
    "awaiting_shipment",
    "partially_shipped",
    "shipped",
    "received",
    "closed",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const RMA_STATUSES = [
    "applied",
    "approved",
    "rejected",
    "cancelled",
    "shipping_back",
    "received",
    "refunding",
    "reshipping",
    "completed",
    "disputed",
] as const
export type RmaStatus = (typeof RMA_STATUSES)[number]

export const RMA_TYPES = ["refund_only", "return_refund", "exchange"] as const
export type RmaType = (typeof RMA_TYPES)[number]

// 各前缀收成 Extract：锁值域 + 保 Record 穷尽性（漏配文案 tsc 当场红）
type OrderStatusKey = Extract<SellerMessageKey, `order.status.${string}`>
type RmaStatusKey = Extract<SellerMessageKey, `order.rmaStatus.${string}`>
type RmaTypeKey = Extract<SellerMessageKey, `order.rmaType.${string}`>
type DecisionKind = Extract<SellerMessageKey, `order.decision.${string}`>

export const ORDER_STATUS_META: Record<
    OrderStatus,
    { labelKey: OrderStatusKey; variant: "default" | "secondary" | "warning" | "info" | "success" }
> = {
    // 子订单没有「待付款」态：未支付由主订单表达，卖家看不到未付款的单；保留词只为筛选全量
    pending_payment: { labelKey: "order.status.pending_payment", variant: "secondary" },
    awaiting_shipment: { labelKey: "order.status.awaiting_shipment", variant: "warning" },
    partially_shipped: { labelKey: "order.status.partially_shipped", variant: "info" },
    shipped: { labelKey: "order.status.shipped", variant: "info" },
    received: { labelKey: "order.status.received", variant: "success" },
    closed: { labelKey: "order.status.closed", variant: "secondary" },
}

// 类型文案走卖家口径，与买家端各自维护：同一状态两角色话不同，不合并
export const RMA_TYPE_LABEL: Record<RmaType, RmaTypeKey> = {
    refund_only: "order.rmaType.refund_only",
    return_refund: "order.rmaType.return_refund",
    exchange: "order.rmaType.exchange",
}

export const RMA_STATUS_META: Record<
    RmaStatus,
    {
        labelKey: RmaStatusKey
        variant: "warning" | "success" | "destructive" | "secondary" | "info"
    }
> = {
    applied: { labelKey: "order.rmaStatus.applied", variant: "warning" },
    approved: { labelKey: "order.rmaStatus.approved", variant: "info" },
    rejected: { labelKey: "order.rmaStatus.rejected", variant: "destructive" },
    cancelled: { labelKey: "order.rmaStatus.cancelled", variant: "secondary" },
    shipping_back: { labelKey: "order.rmaStatus.shipping_back", variant: "warning" },
    received: { labelKey: "order.rmaStatus.received", variant: "info" },
    refunding: { labelKey: "order.rmaStatus.refunding", variant: "info" },
    reshipping: { labelKey: "order.rmaStatus.reshipping", variant: "info" },
    completed: { labelKey: "order.rmaStatus.completed", variant: "success" },
    disputed: { labelKey: "order.rmaStatus.disputed", variant: "destructive" },
}

export const ORDER_STATUS_TABS: ReadonlyArray<
    KeyedStatusOption<OrderStatus | "", OrderStatusKey | "order.tab.all">
> = [{ value: "", labelKey: "order.tab.all" }, ...statusOptionsFromKeys(ORDER_STATUS_META)]

// 售后决策弹窗的三张 key 表：结构化事实（after-sale-decision.ts 的 kind/factTag）→ 文案 key，句子在调用点 t(key) 出
export const DECISION_TITLE: Record<SaleDecisionKind, DecisionKind> = {
    agree: "order.decision.title.agree",
    reject: "order.decision.title.reject",
    receive: "order.decision.title.receive",
    refund: "order.decision.title.refund",
}

export const DECISION_DESC_KEY: Record<DecisionFactTag, DecisionKind> = {
    agreeRefundOnly: "order.decision.desc.agreeRefundOnly",
    agreeReturnRefund: "order.decision.desc.agreeReturnRefund",
    reject: "order.decision.desc.reject",
    receive: "order.decision.desc.receive",
    refund: "order.decision.desc.refund",
}

/** 确认按钮文案：一个动作一个词，不在 JSX 里堆三目 */
export const DECISION_CONFIRM_KEY: Record<Exclude<SaleDecisionKind, "reject">, DecisionKind> = {
    agree: "order.decision.confirmAgree",
    receive: "order.decision.confirmReceive",
    refund: "order.decision.confirmRefund",
}
