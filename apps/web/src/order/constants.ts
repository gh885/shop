import type { AfterSaleReason, TicketStatus, TicketType } from "@shop/api/sdk"

import type { OrderTab } from "./orders-search"
import type {
    MainProgress,
    OrderAction,
    OrderActionSurface,
    OrderItemAction,
    OrderStatus,
} from "./model"

export const ORDER_CARD_STATUS_TONE: Record<
    OrderStatus,
    "warning" | "info" | "success" | "secondary"
> = {
    pending_payment: "warning",
    pending_shipment: "info",
    partially_shipped: "info",
    pending_receipt: "info",
    completed: "success",
    cancelled: "secondary",
}

/** 主进度徽章配色：与子订单状态同一套色板，避免同一张卡上两种语义用不同颜色 */
export const MAIN_PROGRESS_TONE: Record<
    MainProgress,
    "warning" | "info" | "success" | "secondary"
> = {
    pending_payment: "warning",
    pending_shipment: "info",
    partially_shipped: "info",
    pending_receipt: "info",
    completed: "success",
    closed: "secondary",
}

/** 页签：全部 + 五个进度档（已关闭不单列页签，与「已取消」只出现在全部档同一口径） */
export const ORDER_TABS: readonly OrderTab[] = [
    "all",
    "pending_payment",
    "pending_shipment",
    "partially_shipped",
    "pending_receipt",
    "completed",
]

export const ORDER_PROGRESS_STEP_COUNT = 4 as const

export const ORDER_PROGRESS_STEP: Record<OrderStatus, number> = {
    pending_payment: 0,
    pending_shipment: 1,
    // 部分发货与已发货同处「卖家已动手」这一档：进度条只有四格，发一半不该退回第二格
    partially_shipped: 2,
    pending_receipt: 2,
    completed: 3,
    cancelled: -1,
}

export const ORDER_ACTION_ORDER: readonly OrderAction[] = [
    "pay",
    "cancel",
    "logistics",
    "confirm",
    "extend_receive",
    "rebuy",
    "add_cart",
    "ship",
]

const CARD_UI_ACTIONS: Partial<Record<OrderStatus, readonly OrderAction[]>> = {
    // 部分发货已有包裹在路上：看物流是这个阶段最常见的下一步
    partially_shipped: ["logistics"],
    pending_receipt: ["logistics"],
    completed: ["rebuy"],
    cancelled: ["rebuy"],
}

export const ORDER_UI_ACTIONS: Record<
    OrderActionSurface,
    Partial<Record<OrderStatus, readonly OrderAction[]>>
> = {
    card: CARD_UI_ACTIONS,
    // 详情页自己带付款按钮（子订单页没有主订单卡片可依托）；列表卡片的付款画在主订单卡头，不在这里重复画
    detail: { ...CARD_UI_ACTIONS, pending_payment: ["pay"], completed: ["rebuy", "add_cart"] },
}

export const ORDER_PRIMARY_ACTION: Record<
    OrderActionSurface,
    Partial<Record<OrderStatus, OrderAction>>
> = {
    card: { pending_payment: "pay", pending_receipt: "confirm" },
    detail: { pending_payment: "pay", pending_receipt: "confirm", completed: "rebuy" },
}

export const ORDER_ITEM_ACTIONS: readonly OrderItemAction[] = ["add_cart", "after_sale"]

export const AFTER_SALE_TYPE_ORDER: TicketType[] = ["REFUND_ONLY", "RETURN_REFUND"]

export const AFTER_SALE_REASON_ORDER: AfterSaleReason[] = [
    "NO_REASON",
    "QUALITY_ISSUE",
    "NOT_AS_DESCRIBED",
    "DAMAGED",
    "WRONG_ITEM",
    "MISSING_ITEM",
    "OTHER",
]

export const TICKET_STATUS_TONE: Record<TicketStatus, "default" | "secondary" | "destructive"> = {
    APPLYING: "default",
    RETURNING: "default",
    REFUNDED: "secondary",
    REJECTED: "destructive",
    CLOSED: "secondary",
}
