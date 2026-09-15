import { OrderStatus as WireOrderStatus } from "@shop/api/sdk"

/**
 * order 状态机 —— 唯一真相：订单状态类型 + 后端 wire 枚举 ↔ 前端领域枚举 双向映射。
 *
 * 这是「真领域投影」：SDK 只有后端的大写 wire 枚举，而前端履约流没有独立的
 * 「已付款」段（PAID → pending_shipment），所以必须投影，不能透传。
 * 两侧映射表的 key/value 都从 SDK 生成的 OrderStatus const 派生：
 * 后端新增/删改状态时这里编译期即报错，不会静默漏映射。
 *
 * 类型放在这里（包级 shared），订单各组件/model 都引用它；展示辅助（label/色板/进度表）
 * 在 order/constants.ts，此处只保留状态语义本身。
 */

/** 订单状态：与后端枚举对齐（已付款即进入履约流，无待评价/退款中阶段） */
export type OrderStatus =
    | "pending_payment" // 待付款
    | "pending_shipment" // 待发货
    | "pending_receipt" // 待收货
    | "completed" // 已完成 / 交易成功
    | "cancelled" // 已取消

/** wire（后端）状态 → 前端领域枚举。后端 PAID（已付款）映射为待发货（前端履约流无独立「已付款」段） */
const WIRE_TO_STATUS: Record<WireOrderStatus, OrderStatus> = {
    PENDING_PAYMENT: "pending_payment",
    PAID: "pending_shipment",
    SHIPPED: "pending_receipt",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
}

/** 前端领域枚举 → wire（后端）枚举：查询筛选/状态机动作都用后端大写常量 */
const STATUS_TO_WIRE: Record<OrderStatus, WireOrderStatus> = {
    pending_payment: "PENDING_PAYMENT",
    pending_shipment: "PAID",
    pending_receipt: "SHIPPED",
    completed: "COMPLETED",
    cancelled: "CANCELLED",
}

/** 类型守卫：in 检查把 wire 收窄为 WireOrderStatus（in 本身不会把 string 收窄成 keyof） */
function isWireStatus(wire: string): wire is WireOrderStatus {
    return wire in WIRE_TO_STATUS
}

/** wire → 领域：后端状态归一成前端枚举，未知值兜底待付款 */
export function toStatusFromWire(wire?: string): OrderStatus {
    return wire && isWireStatus(wire) ? WIRE_TO_STATUS[wire] : "pending_payment"
}

/** 领域 → wire：查询参数/状态机动作传回后端大写枚举 */
export function statusToWire(status: OrderStatus): WireOrderStatus {
    return STATUS_TO_WIRE[status]
}
