/**
 * 买家订单的 UI 词表。
 *
 * <p>组级展示态由后端 `BuyerOrderQuery.DISPLAY_STATUS` 算出并下发（`pending_payment` / `paid` /
 * `partially_refunded` / `refunded` / `cancelled` / `closed`），前端只做「未知词收敛」，
 * 不自己再合成一套——列表标签与筛选必须同一个词表。
 *
 * <p>子单履约态（`fulfillmentStatus`）是另一条线：`unshipped` / `partial_shipped` / `shipped` /
 * `received`，库里存的正是这四个值。
 */

/** 组级展示态 = 页签 = 徽章，一个词表三处复用 */
export type MainProgress =
    | "pending_payment"
    | "paid"
    | "partially_refunded"
    | "refunded"
    | "cancelled"
    | "closed"

/** 子单履约态；`cancelled` 由 `closedReason` 推出，仅用于展示 */
export type OrderStatus =
    | "pending_payment"
    | "unshipped"
    | "partial_shipped"
    | "shipped"
    | "received"
    | "closed"
    | "cancelled"

// 按 string 索引查表（wire 是自由 string）：认不出的键取到 undefined，由 toMainProgressFromWire 兜底
const WIRE_TO_PROGRESS: Record<string, MainProgress> = {
    pending_payment: "pending_payment",
    paid: "paid",
    partially_refunded: "partially_refunded",
    refunded: "refunded",
    cancelled: "cancelled",
    closed: "closed",
}

/** 未知词（后端加了新态）收敛到 paid：宁可显示得保守，也不把卡片打成空白 */
export function toMainProgressFromWire(wire?: string): MainProgress {
    return (wire && WIRE_TO_PROGRESS[wire]) || "paid"
}

const WIRE_TO_STATUS: Record<string, OrderStatus> = {
    unshipped: "unshipped",
    partial_shipped: "partial_shipped",
    shipped: "shipped",
    received: "received",
}

/** 子单履约态收敛：未知词按 unshipped 处理（保守显示「待发货」） */
export function toStatusFromWire(wire?: string): OrderStatus {
    return (wire && WIRE_TO_STATUS[wire]) || "unshipped"
}

/** 子单已关闭时，用 closedReason 细化展示态 */
export function closedStatus(closedReason: string): OrderStatus {
    return closedReason === "buyer_cancelled" || closedReason === "timeout" ? "cancelled" : "closed"
}
