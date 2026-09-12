import type { AfterSaleStatus, OrderStatus, TicketStatus, TicketType } from "@shop/api/sdk"

/** 订单履约主状态徽章色板（Badge 的 variant） */
export const ORDER_STATUS_META: Record<
    OrderStatus,
    { label: string; variant: "default" | "secondary" | "warning" | "info" | "success" }
> = {
    PENDING_PAYMENT: { label: "待付款", variant: "warning" },
    PAID: { label: "待发货", variant: "default" },
    SHIPPED: { label: "已发货", variant: "info" },
    COMPLETED: { label: "已完成", variant: "success" },
    CANCELLED: { label: "已取消", variant: "secondary" },
}

/** 售后状态徽章（与主状态正交的第二条线；NONE 不渲染徽章） */
export const AFTER_SALE_META: Record<
    AfterSaleStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "warning" | "success" }
> = {
    NONE: { label: "", variant: "secondary" },
    APPLYING: { label: "售后申请中", variant: "warning" },
    RETURNING: { label: "退货中", variant: "warning" },
    REFUNDED: { label: "已退款", variant: "success" },
    REJECTED: { label: "已拒绝", variant: "destructive" },
    CLOSED: { label: "已撤销", variant: "secondary" },
}

/**
 * 售后类型（卖家决策时最要紧的一个字段：仅退款=同意即退钱，退货退款=先等货回来）。
 * 文案与买家端各自维护：同一个状态在两个角色眼里该说的话不同（买家看「待寄回商品」、卖家看「退货中」），
 * 强行合并成一份共享文案只会逼一方读另一方的话。
 */
export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
    REFUND_ONLY: "仅退款",
    RETURN_REFUND: "退货退款",
}

/** 售后单状态（决策弹窗顶部的一行事实） */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
    APPLYING: "待处理",
    RETURNING: "退货中",
    REFUNDED: "已退款",
    REJECTED: "已拒绝",
    CLOSED: "已撤销",
}

/** 顶部 tab：全部（空串）+ 五个履约主状态；空串=不过滤 */ export const ORDER_STATUS_TABS: ReadonlyArray<{
    value: OrderStatus | ""
    label: string
}> = [
    { value: "", label: "全部" },
    { value: "PENDING_PAYMENT", label: "待付款" },
    { value: "PAID", label: "待发货" },
    { value: "SHIPPED", label: "已发货" },
    { value: "COMPLETED", label: "已完成" },
    { value: "CANCELLED", label: "已取消" },
]
