import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type {
    AfterSaleReason,
    AfterSaleStatus,
    OrderStatus,
    TicketStatus,
    TicketType,
} from "@shop/api/sdk"
import type { SellerMessageKey } from "#/locales/messages.gen"

// 每个前缀收成一条 Extract：既锁住「这格的值必须是该域的状态 key（写错 key 编译不过）」，
// 又保住 `Record<码值, key>` 的穷尽性（加一个状态忘了配文案，tsc 当场红）。句子在 catalog。
type OrderStatusKey = Extract<SellerMessageKey, `seller.order.status.${string}`>
type AfterSaleKey = Extract<SellerMessageKey, `seller.order.afterSale.${string}`>
type TicketTypeKey = Extract<SellerMessageKey, `seller.order.ticketType.${string}`>
type TicketStatusKey = Extract<SellerMessageKey, `seller.order.ticketStatus.${string}`>
type ReasonKey = Extract<SellerMessageKey, `seller.order.reason.${string}`>

/** 订单履约主状态徽章（Badge 的 variant 不变；文案换成 catalog key） */
export const ORDER_STATUS_META: Record<
    OrderStatus,
    { labelKey: OrderStatusKey; variant: "default" | "secondary" | "warning" | "info" | "success" }
> = {
    PENDING_PAYMENT: { labelKey: "seller.order.status.PENDING_PAYMENT", variant: "warning" },
    PAID: { labelKey: "seller.order.status.PAID", variant: "info" },
    SHIPPED: { labelKey: "seller.order.status.SHIPPED", variant: "info" },
    COMPLETED: { labelKey: "seller.order.status.COMPLETED", variant: "success" },
    CANCELLED: { labelKey: "seller.order.status.CANCELLED", variant: "secondary" },
}

/**
 * 售后状态徽章（与主状态正交的第二条线）。
 * NONE 不进表——它在渲染处已被 `afterSaleStatus === "NONE" ? undefined` 挡掉、从不显示，
 * 没有要翻译的句子就没有 key（硬塞一个空 key 会撞「未使用 key」门禁）。
 */
export const AFTER_SALE_META: Record<
    Exclude<AfterSaleStatus, "NONE">,
    { labelKey: AfterSaleKey; variant: "secondary" | "destructive" | "warning" | "success" }
> = {
    APPLYING: { labelKey: "seller.order.afterSale.APPLYING", variant: "warning" },
    RETURNING: { labelKey: "seller.order.afterSale.RETURNING", variant: "warning" },
    REFUNDED: { labelKey: "seller.order.afterSale.REFUNDED", variant: "success" },
    REJECTED: { labelKey: "seller.order.afterSale.REJECTED", variant: "destructive" },
    CLOSED: { labelKey: "seller.order.afterSale.CLOSED", variant: "secondary" },
}

/**
 * 售后类型（卖家决策时最要紧的一个字段：仅退款=同意即退钱，退货退款=先等货回来）。
 * 文案与买家端各自维护：同一个状态在两个角色眼里该说的话不同，强行合并只会逼一方读另一方的话。
 */
export const TICKET_TYPE_LABEL: Record<TicketType, TicketTypeKey> = {
    REFUND_ONLY: "seller.order.ticketType.REFUND_ONLY",
    RETURN_REFUND: "seller.order.ticketType.RETURN_REFUND",
}

/**
 * 售后单状态（卖家口径）：文案与徽章色同表一处——工作台的页签、行内徽章、决策弹窗顶部
 * 读的都是这张表，不再各自抄一份中文和一份色板。
 */
export const TICKET_STATUS_META: Record<
    TicketStatus,
    { labelKey: TicketStatusKey; variant: "warning" | "success" | "destructive" | "secondary" }
> = {
    APPLYING: { labelKey: "seller.order.ticketStatus.APPLYING", variant: "warning" },
    RETURNING: { labelKey: "seller.order.ticketStatus.RETURNING", variant: "warning" },
    REFUNDED: { labelKey: "seller.order.ticketStatus.REFUNDED", variant: "success" },
    REJECTED: { labelKey: "seller.order.ticketStatus.REJECTED", variant: "destructive" },
    CLOSED: { labelKey: "seller.order.ticketStatus.CLOSED", variant: "secondary" },
}

/**
 * 售后原因（买家选的那一项）。
 *
 * 「七天无理由」在这里被单独立出来是有代价的：它是消保法第 25 条给买家的权利，卖家在这一单的
 * 受理阶段只剩「同意」——所以工作台必须把它显眼地讲出来，而不是让卖家对着一个不见了的按钮猜。
 */
export const TICKET_REASON_LABEL: Record<AfterSaleReason, ReasonKey> = {
    NO_REASON: "seller.order.reason.NO_REASON",
    QUALITY_ISSUE: "seller.order.reason.QUALITY_ISSUE",
    NOT_AS_DESCRIBED: "seller.order.reason.NOT_AS_DESCRIBED",
    DAMAGED: "seller.order.reason.DAMAGED",
    WRONG_ITEM: "seller.order.reason.WRONG_ITEM",
    MISSING_ITEM: "seller.order.reason.MISSING_ITEM",
    OTHER: "seller.order.reason.OTHER",
}

/**
 * 顶部 tab：全部（空串哨兵）+ 五个履约主状态；空串=不过滤。
 * 标签从 ORDER_STATUS_META 派生（走 statusOptionsFromKeys），不另写一份中文——页签与徽章说的是同一个状态。
 * 出的是 labelKey，句子在 OrderFilterBar 渲染时由本端 `t` 换。
 */
export const ORDER_STATUS_TABS: ReadonlyArray<
    KeyedStatusOption<OrderStatus | "", OrderStatusKey | "seller.order.tab.all">
> = [{ value: "", labelKey: "seller.order.tab.all" }, ...statusOptionsFromKeys(ORDER_STATUS_META)]
