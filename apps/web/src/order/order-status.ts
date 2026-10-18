import { MainProgress as WireMainProgress, OrderStatus as WireOrderStatus } from "@shop/api/sdk"

/**
 * 子订单履约状态（UI 词表）：货走到哪。
 *
 * <p>比后端多一个 `pending_payment`：它不是子订单的状态，而是「主订单还没付」在详情页的显示口径
 * ——子订单创建即待发货，未付款这件事由主订单表达（docs/domain/order-model.md §5.1），
 * 但买家在详情页看到的标题必须说「待付款」。mapper 装配时用 `tradeStatus` 收敛进这一个词表，
 * 于是页面里只认一套状态字面量。
 */
export type OrderStatus =
    | "pending_payment"
    | "pending_shipment"
    | "partially_shipped"
    | "pending_receipt"
    | "completed"
    | "cancelled"

/** 主进度（§5.3）：买家在列表卡片上看到的那一条线，由后端按主订单算好下发 */
export type MainProgress =
    | "pending_payment"
    | "pending_shipment"
    | "partially_shipped"
    | "pending_receipt"
    | "completed"
    | "closed"

const WIRE_TO_STATUS: Record<WireOrderStatus, OrderStatus> = {
    PAID: "pending_shipment",
    PARTIALLY_SHIPPED: "partially_shipped",
    SHIPPED: "pending_receipt",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
}

const WIRE_TO_PROGRESS: Record<WireMainProgress, MainProgress> = {
    PENDING_PAYMENT: "pending_payment",
    PENDING_SHIPMENT: "pending_shipment",
    PARTIALLY_SHIPPED: "partially_shipped",
    PENDING_RECEIPT: "pending_receipt",
    COMPLETED: "completed",
    CLOSED: "closed",
}

const PROGRESS_TO_WIRE: Record<MainProgress, WireMainProgress> = {
    pending_payment: WireMainProgress.PENDING_PAYMENT,
    pending_shipment: WireMainProgress.PENDING_SHIPMENT,
    partially_shipped: WireMainProgress.PARTIALLY_SHIPPED,
    pending_receipt: WireMainProgress.PENDING_RECEIPT,
    completed: WireMainProgress.COMPLETED,
    closed: WireMainProgress.CLOSED,
}

function isWireStatus(wire: string): wire is WireOrderStatus {
    return wire in WIRE_TO_STATUS
}

/** 未知词（后端加了新态）收敛到待发货：宁可显示得保守，也不把卡片打成空白 */
export function toStatusFromWire(wire?: string): OrderStatus {
    return wire && isWireStatus(wire) ? WIRE_TO_STATUS[wire] : "pending_shipment"
}

export function toMainProgressFromWire(wire: WireMainProgress): MainProgress {
    return WIRE_TO_PROGRESS[wire]
}

/** 页签筛选上行的词：页签用 UI 词表，接口认后端枚举 */
export function mainProgressToWire(progress: MainProgress): WireMainProgress {
    return PROGRESS_TO_WIRE[progress]
}
