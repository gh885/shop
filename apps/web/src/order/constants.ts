import type { AfterSaleReason, TicketStatus, TicketType } from "@shop/api/sdk"

import type { OrderTab } from "./orders-search"
import type { OrderAction, OrderActionSurface, OrderStatus } from "./model"

export const ORDER_CARD_STATUS_TONE: Record<
    OrderStatus,
    "warning" | "info" | "success" | "secondary"
> = {
    pending_payment: "warning",
    pending_shipment: "info",
    pending_receipt: "info",
    completed: "success",
    cancelled: "secondary",
}

export const ORDER_STATUS_TABS: readonly OrderTab[] = [
    "all",
    "pending_payment",
    "pending_shipment",
    "pending_receipt",
    "completed",
]

export const ORDER_PROGRESS_STEP_COUNT = 4 as const

export const ORDER_PROGRESS_STEP: Record<OrderStatus, number> = {
    pending_payment: 0,
    pending_shipment: 1,
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
    pending_receipt: ["logistics"],
    completed: ["rebuy"],
    cancelled: ["rebuy"],
}

export const ORDER_UI_ACTIONS: Record<
    OrderActionSurface,
    Partial<Record<OrderStatus, readonly OrderAction[]>>
> = {
    card: CARD_UI_ACTIONS,
    detail: { ...CARD_UI_ACTIONS, completed: ["rebuy", "add_cart"] },
}

export const ORDER_PRIMARY_ACTION: Record<
    OrderActionSurface,
    Partial<Record<OrderStatus, OrderAction>>
> = {
    card: { pending_payment: "pay", pending_receipt: "confirm" },
    detail: { pending_payment: "pay", pending_receipt: "confirm", completed: "rebuy" },
}

export const ORDER_ITEM_ACTIONS: readonly string[] = ["add_cart", "after_sale"]

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
