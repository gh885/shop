import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type {
    AfterSaleReason,
    AfterSaleStatus,
    OrderStatus,
    TicketStatus,
    TicketType,
} from "@shop/api/sdk"
import type { SellerMessageKey } from "#/locales/messages.gen"

// 各前缀收成 Extract：锁值域 + 保 Record 穷尽性（漏配文案 tsc 当场红）
type OrderStatusKey = Extract<SellerMessageKey, `order.status.${string}`>
type AfterSaleKey = Extract<SellerMessageKey, `order.afterSale.${string}`>
type TicketTypeKey = Extract<SellerMessageKey, `order.ticketType.${string}`>
type TicketStatusKey = Extract<SellerMessageKey, `order.ticketStatus.${string}`>
type ReasonKey = Extract<SellerMessageKey, `order.reason.${string}`>

export const ORDER_STATUS_META: Record<
    OrderStatus,
    { labelKey: OrderStatusKey; variant: "default" | "secondary" | "warning" | "info" | "success" }
> = {
    // 子订单没有「待付款」态：未支付由主订单表达（§5.1），卖家看不到未付款的单
    PAID: { labelKey: "order.status.PAID", variant: "info" },
    PARTIALLY_SHIPPED: { labelKey: "order.status.PARTIALLY_SHIPPED", variant: "info" },
    SHIPPED: { labelKey: "order.status.SHIPPED", variant: "info" },
    COMPLETED: { labelKey: "order.status.COMPLETED", variant: "success" },
    CANCELLED: { labelKey: "order.status.CANCELLED", variant: "secondary" },
}

// NONE 不进表：渲染处已挡、从不显示，硬塞空 key 会撞「未使用 key」门禁
export const AFTER_SALE_META: Record<
    Exclude<AfterSaleStatus, "NONE">,
    { labelKey: AfterSaleKey; variant: "secondary" | "destructive" | "warning" | "success" }
> = {
    APPLYING: { labelKey: "order.afterSale.APPLYING", variant: "warning" },
    RETURNING: { labelKey: "order.afterSale.RETURNING", variant: "warning" },
    REFUNDED: { labelKey: "order.afterSale.REFUNDED", variant: "success" },
    REJECTED: { labelKey: "order.afterSale.REJECTED", variant: "destructive" },
    CLOSED: { labelKey: "order.afterSale.CLOSED", variant: "secondary" },
}

// 类型文案走卖家口径，与买家端各自维护：同一状态两角色话不同，不合并
export const TICKET_TYPE_LABEL: Record<TicketType, TicketTypeKey> = {
    REFUND_ONLY: "order.ticketType.REFUND_ONLY",
    RETURN_REFUND: "order.ticketType.RETURN_REFUND",
}

export const TICKET_STATUS_META: Record<
    TicketStatus,
    { labelKey: TicketStatusKey; variant: "warning" | "success" | "destructive" | "secondary" }
> = {
    APPLYING: { labelKey: "order.ticketStatus.APPLYING", variant: "warning" },
    RETURNING: { labelKey: "order.ticketStatus.RETURNING", variant: "warning" },
    REFUNDED: { labelKey: "order.ticketStatus.REFUNDED", variant: "success" },
    REJECTED: { labelKey: "order.ticketStatus.REJECTED", variant: "destructive" },
    CLOSED: { labelKey: "order.ticketStatus.CLOSED", variant: "secondary" },
}

export const TICKET_REASON_LABEL: Record<AfterSaleReason, ReasonKey> = {
    NO_REASON: "order.reason.NO_REASON",
    QUALITY_ISSUE: "order.reason.QUALITY_ISSUE",
    NOT_AS_DESCRIBED: "order.reason.NOT_AS_DESCRIBED",
    DAMAGED: "order.reason.DAMAGED",
    WRONG_ITEM: "order.reason.WRONG_ITEM",
    MISSING_ITEM: "order.reason.MISSING_ITEM",
    OTHER: "order.reason.OTHER",
}

export const ORDER_STATUS_TABS: ReadonlyArray<
    KeyedStatusOption<OrderStatus | "", OrderStatusKey | "order.tab.all">
> = [{ value: "", labelKey: "order.tab.all" }, ...statusOptionsFromKeys(ORDER_STATUS_META)]
