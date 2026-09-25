import { statusOptions } from "@shop/common"

import type {
    AfterSaleReason,
    AfterSaleStatus,
    OrderStatus,
    TicketStatus,
    TicketType,
} from "@shop/api/sdk"

/** 订单履约主状态徽章色板（Badge 的 variant） */
export const ORDER_STATUS_META: Record<
    OrderStatus,
    { label: string; variant: "default" | "secondary" | "warning" | "info" | "success" }
> = {
    PENDING_PAYMENT: { label: "待付款", variant: "warning" },
    PAID: { label: "待发货", variant: "info" },
    SHIPPED: { label: "已发货", variant: "info" },
    COMPLETED: { label: "已完成", variant: "success" },
    CANCELLED: { label: "已取消", variant: "secondary" },
}

/** 售后状态徽章（与主状态正交的第二条线；NONE 不渲染徽章） */
export const AFTER_SALE_META: Record<
    AfterSaleStatus,
    { label: string; variant: "secondary" | "destructive" | "warning" | "success" }
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

/**
 * 售后单状态（卖家口径）：文案与徽章色同表一处——工作台的页签、行内徽章、决策弹窗顶部
 * 读的都是这张表，不再各自抄一份中文和一份色板。
 */
export const TICKET_STATUS_META: Record<
    TicketStatus,
    { label: string; variant: "warning" | "success" | "destructive" | "secondary" }
> = {
    APPLYING: { label: "待处理", variant: "warning" },
    RETURNING: { label: "退货中", variant: "warning" },
    REFUNDED: { label: "已退款", variant: "success" },
    REJECTED: { label: "已拒绝", variant: "destructive" },
    CLOSED: { label: "已撤销", variant: "secondary" },
}

/**
 * 售后原因（买家选的那一项）。
 *
 * 「七天无理由」在这里被单独立出来是有代价的：它是消保法第 25 条给买家的权利，卖家在这一单的
 * 受理阶段只剩「同意」——所以工作台必须把它显眼地讲出来，而不是让卖家对着一个不见了的按钮猜。
 */
export const TICKET_REASON_LABEL: Record<AfterSaleReason, string> = {
    NO_REASON: "七天无理由",
    QUALITY_ISSUE: "质量问题",
    NOT_AS_DESCRIBED: "与描述不符",
    DAMAGED: "破损或污渍",
    WRONG_ITEM: "发错货",
    MISSING_ITEM: "少件或漏发",
    OTHER: "其他",
}

/**
 * 顶部 tab：全部（空串）+ 五个履约主状态；空串=不过滤。
 * 标签从 ORDER_STATUS_META 派生，不另写一份中文——页签与徽章说的是同一个状态。
 */
export const ORDER_STATUS_TABS: ReadonlyArray<{ value: OrderStatus | ""; label: string }> = [
    { value: "", label: "全部" },
    ...statusOptions(ORDER_STATUS_META),
]
