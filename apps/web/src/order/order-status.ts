import { OrderStatus as WireOrderStatus } from "@shop/api/sdk"

export type OrderStatus =
    | "pending_payment"
    | "pending_shipment"
    | "pending_receipt"
    | "completed"
    | "cancelled"

const WIRE_TO_STATUS: Record<WireOrderStatus, OrderStatus> = {
    PENDING_PAYMENT: "pending_payment",
    PAID: "pending_shipment",
    SHIPPED: "pending_receipt",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
}

const STATUS_TO_WIRE: Record<OrderStatus, WireOrderStatus> = {
    pending_payment: "PENDING_PAYMENT",
    pending_shipment: "PAID",
    pending_receipt: "SHIPPED",
    completed: "COMPLETED",
    cancelled: "CANCELLED",
}

function isWireStatus(wire: string): wire is WireOrderStatus {
    return wire in WIRE_TO_STATUS
}

export function toStatusFromWire(wire?: string): OrderStatus {
    return wire && isWireStatus(wire) ? WIRE_TO_STATUS[wire] : "pending_payment"
}

export function statusToWire(status: OrderStatus): WireOrderStatus {
    return STATUS_TO_WIRE[status]
}
