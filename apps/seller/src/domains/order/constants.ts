import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type {
    AfterSaleBadge,
    AfterSaleReason,
    OrderStatus,
    RefundStatus,
    RefundType,
} from "@shop/api/sdk"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { DecisionFactTag, SaleDecisionKind } from "./after-sale-decision"

// 各前缀收成 Extract：锁值域 + 保 Record 穷尽性（漏配文案 tsc 当场红）
type OrderStatusKey = Extract<SellerMessageKey, `order.status.${string}`>
type AfterSaleBadgeKey = Extract<SellerMessageKey, `order.afterSaleBadge.${string}`>
type RefundTypeKey = Extract<SellerMessageKey, `order.refundType.${string}`>
type RefundStatusKey = Extract<SellerMessageKey, `order.refundStatus.${string}`>
type ReasonKey = Extract<SellerMessageKey, `order.reason.${string}`>
type DecisionKind = Extract<SellerMessageKey, `order.decision.${string}`>

export const ORDER_STATUS_META: Record<
    OrderStatus,
    { labelKey: OrderStatusKey; variant: "default" | "secondary" | "warning" | "info" | "success" }
> = {
    // 子订单没有「待付款」态：未支付由主订单表达（§5.1），卖家看不到未付款的单
    PAID: { labelKey: "order.status.PAID", variant: "info" },
    PARTIALLY_SHIPPED: { labelKey: "order.status.PARTIALLY_SHIPPED", variant: "info" },
    SHIPPED: { labelKey: "order.status.SHIPPED", variant: "info" },
    COMPLETED: { labelKey: "order.status.COMPLETED", variant: "success" },
    CANCELLED: { labelKey: "order.status.CANCELLED", variant: "secondary" },
}

// NONE 不进表：渲染处已挡、从不显示，硬塞空 key 会撞「未使用 key」门禁
export const AFTER_SALE_BADGE_META: Record<
    Exclude<AfterSaleBadge, "NONE">,
    { labelKey: AfterSaleBadgeKey; variant: "secondary" | "warning" | "success" }
> = {
    REFUNDING: { labelKey: "order.afterSaleBadge.REFUNDING", variant: "warning" },
    REFUNDED: { labelKey: "order.afterSaleBadge.REFUNDED", variant: "success" },
    COMPENSATED: { labelKey: "order.afterSaleBadge.COMPENSATED", variant: "secondary" },
}

// 类型文案走卖家口径，与买家端各自维护：同一状态两角色话不同，不合并
export const REFUND_TYPE_LABEL: Record<RefundType, RefundTypeKey> = {
    REFUND_ONLY: "order.refundType.REFUND_ONLY",
    RETURN_REFUND: "order.refundType.RETURN_REFUND",
    COMPENSATION: "order.refundType.COMPENSATION",
}

export const REFUND_STATUS_META: Record<
    RefundStatus,
    {
        labelKey: RefundStatusKey
        variant: "warning" | "success" | "destructive" | "secondary" | "info"
    }
> = {
    PENDING: { labelKey: "order.refundStatus.PENDING", variant: "warning" },
    AGREED: { labelKey: "order.refundStatus.AGREED", variant: "info" },
    RETURN_PENDING: { labelKey: "order.refundStatus.RETURN_PENDING", variant: "warning" },
    RETURNED: { labelKey: "order.refundStatus.RETURNED", variant: "warning" },
    RECEIVED: { labelKey: "order.refundStatus.RECEIVED", variant: "info" },
    REFUNDING: { labelKey: "order.refundStatus.REFUNDING", variant: "info" },
    REFUNDED: { labelKey: "order.refundStatus.REFUNDED", variant: "success" },
    REJECTED: { labelKey: "order.refundStatus.REJECTED", variant: "destructive" },
    CANCELLED: { labelKey: "order.refundStatus.CANCELLED", variant: "secondary" },
    FAILED: { labelKey: "order.refundStatus.FAILED", variant: "destructive" },
}

export const TICKET_REASON_LABEL: Record<AfterSaleReason, ReasonKey> = {
    NO_REASON: "order.reason.NO_REASON",
    QUALITY_ISSUE: "order.reason.QUALITY_ISSUE",
    NOT_AS_DESCRIBED: "order.reason.NOT_AS_DESCRIBED",
    DAMAGED: "order.reason.DAMAGED",
    WRONG_ITEM: "order.reason.WRONG_ITEM",
    MISSING_ITEM: "order.reason.MISSING_ITEM",
    OTHER: "order.reason.OTHER",
}

export const ORDER_STATUS_TABS: ReadonlyArray<
    KeyedStatusOption<OrderStatus | "", OrderStatusKey | "order.tab.all">
> = [{ value: "", labelKey: "order.tab.all" }, ...statusOptionsFromKeys(ORDER_STATUS_META)]

// 售后决策弹窗的三张 key 表：结构化事实（after-sale-decision.ts 的 kind/factTag）→ 文案 key，句子在调用点 t(key) 出
export const DECISION_TITLE: Record<SaleDecisionKind, DecisionKind> = {
    agree: "order.decision.title.agree",
    reject: "order.decision.title.reject",
    receive: "order.decision.title.receive",
    intercept: "order.decision.title.intercept",
    retry: "order.decision.title.retry",
}

export const DECISION_DESC_KEY: Record<DecisionFactTag, DecisionKind> = {
    agreeRefundOnly: "order.decision.desc.agreeRefundOnly",
    agreeReturnRefund: "order.decision.desc.agreeReturnRefund",
    agreeNoTicket: "order.decision.desc.agreeNoTicket",
    rejectOther: "order.decision.desc.rejectOther",
    rejectNoTicket: "order.decision.desc.rejectNoTicket",
    receive: "order.decision.desc.receive",
    intercept: "order.decision.desc.intercept",
    retry: "order.decision.desc.retry",
}

/** 确认按钮文案：一个动作一个词，不在 JSX 里堆三目 */
export const DECISION_CONFIRM_KEY: Record<Exclude<SaleDecisionKind, "reject">, DecisionKind> = {
    agree: "order.decision.confirmAgree",
    receive: "order.decision.confirmReceive",
    intercept: "order.decision.confirmIntercept",
    retry: "order.decision.confirmRetry",
}

/** 退货那一行：承运商缺失时的兜底词与「尚未登记」占位句 */
export const RETURN_CARRIER_FALLBACK_KEY = "order.decision.defaultCarrier" as const

export const NO_RETURN_TRACKING_KEY = "order.decision.noReturnTracking" as const
