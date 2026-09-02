/**
 * order 状态机 —— 唯一真相：订单状态类型 + 后端 wire 枚举 ↔ 前端领域枚举 双向映射。
 *
 * 这是「真领域投影」：SDK 只有后端的大写 wire 枚举，而前端履约流没有独立的
 * 「已付款」段（PAID → pending_shipment），所以必须投影，不能透传。
 *
 * 类型放在这里（包级 shared），订单各组件/model 都引用它；展示辅助（label/进度）
 * 留在 order/model.ts，此处只保留状态语义本身。
 */

/** 订单状态：与后端枚举对齐（已付款即进入履约流，无待评价/退款中阶段） */
export type OrderStatus =
    | "pending_payment" // 待付款
    | "pending_shipment" // 待发货
    | "pending_receipt" // 待收货
    | "completed" // 已完成 / 交易成功
    | "cancelled" // 已取消

/** wire（后端）状态 → 前端领域枚举。后端 PAID（已付款）映射为待发货（前端履约流无独立「已付款」段） */
const WIRE_TO_STATUS: Record<string, OrderStatus> = {
    PENDING_PAYMENT: "pending_payment",
    PAID: "pending_shipment",
    SHIPPED: "pending_receipt",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
}

/** 前端领域枚举 → wire（后端）枚举：查询筛选/状态机动作都用后端大写常量 */
const STATUS_TO_WIRE: Record<OrderStatus, string> = {
    pending_payment: "PENDING_PAYMENT",
    pending_shipment: "PAID",
    pending_receipt: "SHIPPED",
    completed: "COMPLETED",
    cancelled: "CANCELLED",
}

/** wire → 领域：后端状态归一成前端枚举，未知值兜底待付款 */
export function toStatusFromWire(wire?: string): OrderStatus {
    return wire ? (WIRE_TO_STATUS[wire] ?? "pending_payment") : "pending_payment"
}

/** 领域 → wire：查询参数/状态机动作传回后端大写枚举 */
export function statusToWire(status: OrderStatus): string {
    return STATUS_TO_WIRE[status]
}
