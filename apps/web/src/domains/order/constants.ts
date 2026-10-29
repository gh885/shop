import type { OrderTab } from "./search"
import type { MainProgress, OrderAction, OrderActionSurface, OrderItemAction } from "./rules"
import type { CaseStatus, CaseType } from "./after-sale"

/** 组级展示态配色：待付款提醒、进行中中性、终态收敛 */
export const MAIN_PROGRESS_TONE: Record<
    MainProgress,
    "warning" | "info" | "success" | "secondary"
> = {
    pending_payment: "warning",
    paid: "info",
    partially_refunded: "info",
    refunded: "secondary",
    cancelled: "secondary",
    closed: "secondary",
}

/** 页签：全部 + 后端展示态。`closed` 不单列（与「已取消」同档处理） */
export const ORDER_TABS: readonly OrderTab[] = [
    "all",
    "pending_payment",
    "paid",
    "partially_refunded",
    "refunded",
]

export const ORDER_PROGRESS_STEP_COUNT = 4 as const

export const ORDER_ACTION_ORDER: readonly OrderAction[] = [
    "pay",
    "cancel",
    "logistics",
    "confirm",
    "rebuy",
    "add_cart",
]

/** 卡片上只放最常用的一两个动作；详情页再补全 */
const CARD_UI_ACTIONS: Partial<Record<MainProgress, readonly OrderAction[]>> = {
    paid: ["logistics"],
    partially_refunded: ["logistics"],
    refunded: ["rebuy"],
    cancelled: ["rebuy"],
    closed: ["rebuy"],
}

export const ORDER_UI_ACTIONS: Record<
    OrderActionSurface,
    Partial<Record<MainProgress, readonly OrderAction[]>>
> = {
    card: CARD_UI_ACTIONS,
    detail: {
        ...CARD_UI_ACTIONS,
        pending_payment: ["pay", "cancel"],
        paid: ["logistics", "confirm"],
        partially_refunded: ["logistics", "confirm"],
        refunded: ["rebuy", "add_cart"],
    },
}

export const ORDER_PRIMARY_ACTION: Record<
    OrderActionSurface,
    Partial<Record<MainProgress, OrderAction>>
> = {
    card: { pending_payment: "pay" },
    detail: { pending_payment: "pay", paid: "confirm", partially_refunded: "confirm" },
}

/**
 * 按钮外观：按<b>角色</b>取色，不按 action 固定——同一个「确认收货」在主操作位是实心、
 * 在卡片没有主操作时是描边，谁是主操作由 {@link ORDER_PRIMARY_ACTION} 决定。
 */
export const ORDER_ACTION_VARIANT: Record<"primary" | "secondary", "default" | "outline"> = {
    primary: "default",
    secondary: "outline",
}

export const ORDER_ITEM_ACTIONS: readonly OrderItemAction[] = ["add_cart", "after_sale"]

export const AFTER_SALE_TYPE_ORDER: CaseType[] = ["REFUND_ONLY", "RETURN_REFUND", "EXCHANGE"]

/** 售后状态配色：进行中给 default、完成给 secondary、被拒/取消给 outline */
export const CASE_STATUS_TONE: Record<
    CaseStatus,
    "default" | "secondary" | "destructive" | "outline"
> = {
    APPLIED: "default",
    APPROVED: "default",
    REJECTED: "destructive",
    CANCELLED: "outline",
    SHIPPING_BACK: "default",
    RECEIVED: "default",
    REFUNDING: "default",
    RESHIPPING: "default",
    COMPLETED: "secondary",
    DISPUTED: "destructive",
}
