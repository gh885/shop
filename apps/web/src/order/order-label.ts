import type { MainProgress, OrderAction, OrderItemAction, OrderStatus } from "./model"
import type { OrderTab } from "./orders-search"
import type { AfterSaleAction } from "./after-sale"
import type { AfterSaleReason, TicketStatus, TicketType } from "@shop/api/sdk"

import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"

export function orderStatusLabel(status: OrderStatus, t: WebTranslate): string {
    return t(ORDER_STATUS_KEY[status])
}

const ORDER_STATUS_KEY: Record<OrderStatus, WebOrderStatusKey> = {
    pending_payment: "order.status.pending_payment",
    pending_shipment: "order.status.pending_shipment",
    partially_shipped: "order.status.partially_shipped",
    pending_receipt: "order.status.pending_receipt",
    completed: "order.status.completed",
    cancelled: "order.status.cancelled",
}

/** 主进度文案（§5.3）：卡片徽章与页签共用一套词，避免同一态在两处叫不同名字 */
export function mainProgressLabel(progress: MainProgress, t: WebTranslate): string {
    return t(MAIN_PROGRESS_KEY[progress])
}

const MAIN_PROGRESS_KEY: Record<MainProgress, WebMainProgressKey> = {
    pending_payment: "order.mainProgress.pending_payment",
    pending_shipment: "order.mainProgress.pending_shipment",
    partially_shipped: "order.mainProgress.partially_shipped",
    pending_receipt: "order.mainProgress.pending_receipt",
    completed: "order.mainProgress.completed",
    closed: "order.mainProgress.closed",
}

/** 卡片上的一句话说明：告诉买家「现在该等什么」，不长于一行 */
export function mainProgressHint(progress: MainProgress, t: WebTranslate): string {
    return t(MAIN_PROGRESS_HINT_KEY[progress])
}

const MAIN_PROGRESS_HINT_KEY: Record<MainProgress, WebMainProgressHintKey> = {
    pending_payment: "order.mainProgressHint.pending_payment",
    pending_shipment: "order.mainProgressHint.pending_shipment",
    partially_shipped: "order.mainProgressHint.partially_shipped",
    pending_receipt: "order.mainProgressHint.pending_receipt",
    completed: "order.mainProgressHint.completed",
    closed: "order.mainProgressHint.closed",
}

export function orderProgressStep(index: number, t: WebTranslate): string {
    return t(ORDER_PROGRESS_KEY[index] ?? "order.progress.ordered")
}

const ORDER_PROGRESS_KEY = [
    "order.progress.ordered",
    "order.progress.paid",
    "order.progress.shipped",
    "order.progress.received",
] as const satisfies readonly WebOrderProgressKey[]

export function orderActionLabel(action: OrderAction, t: WebTranslate): string {
    return t(ORDER_ACTION_KEY[action])
}

export const ORDER_ACTION_KEY: Record<OrderAction, WebOrderActionKey> = {
    pay: "order.action.pay",
    cancel: "order.action.cancel",
    logistics: "order.action.logistics",
    confirm: "order.action.confirm",
    extend_receive: "order.action.extend_receive",
    rebuy: "order.action.rebuy",
    add_cart: "order.action.add_cart",
    ship: "order.action.ship",
}

export function orderItemActionLabel(action: OrderItemAction, t: WebTranslate): string {
    return t(ORDER_ITEM_ACTION_KEY[action])
}

const ORDER_ITEM_ACTION_KEY: Record<OrderItemAction, WebOrderItemActionKey> = {
    add_cart: "order.itemAction.add_cart",
    after_sale: "order.itemAction.after_sale",
}

export function afterSaleTypeLabel(type: TicketType, t: WebTranslate): string {
    return t(AFTER_SALE_TYPE_KEY[type])
}

const AFTER_SALE_TYPE_KEY: Record<TicketType, WebAfterSaleTypeKey> = {
    REFUND_ONLY: "order.afterSale.type.REFUND_ONLY",
    RETURN_REFUND: "order.afterSale.type.RETURN_REFUND",
}

export function afterSaleTypeHint(type: TicketType, t: WebTranslate): string {
    return t(AFTER_SALE_TYPE_HINT_KEY[type])
}

const AFTER_SALE_TYPE_HINT_KEY: Record<TicketType, WebAfterSaleTypeHintKey> = {
    REFUND_ONLY: "order.afterSale.typeHint.REFUND_ONLY",
    RETURN_REFUND: "order.afterSale.typeHint.RETURN_REFUND",
}

export function afterSaleReasonLabel(reason: AfterSaleReason, t: WebTranslate): string {
    return t(AFTER_SALE_REASON_KEY[reason])
}

const AFTER_SALE_REASON_KEY: Record<AfterSaleReason, WebAfterSaleReasonKey> = {
    NO_REASON: "order.afterSale.reason.NO_REASON",
    QUALITY_ISSUE: "order.afterSale.reason.QUALITY_ISSUE",
    NOT_AS_DESCRIBED: "order.afterSale.reason.NOT_AS_DESCRIBED",
    DAMAGED: "order.afterSale.reason.DAMAGED",
    WRONG_ITEM: "order.afterSale.reason.WRONG_ITEM",
    MISSING_ITEM: "order.afterSale.reason.MISSING_ITEM",
    OTHER: "order.afterSale.reason.OTHER",
}

export function ticketStatusLabel(status: TicketStatus, t: WebTranslate): string {
    return t(TICKET_STATUS_KEY[status])
}

const TICKET_STATUS_KEY: Record<TicketStatus, WebAfterSaleTicketStatusKey> = {
    APPLYING: "order.afterSale.ticketStatus.APPLYING",
    RETURNING: "order.afterSale.ticketStatus.RETURNING",
    REFUNDED: "order.afterSale.ticketStatus.REFUNDED",
    REJECTED: "order.afterSale.ticketStatus.REJECTED",
    CLOSED: "order.afterSale.ticketStatus.CLOSED",
}

export function afterSaleActionLabel(action: AfterSaleAction, t: WebTranslate): string {
    return t(AFTER_SALE_ACTION_KEY[action])
}

const AFTER_SALE_ACTION_KEY: Record<AfterSaleAction, WebAfterSaleActionKey> = {
    cancel: "order.afterSale.action.cancel",
    return: "order.afterSale.action.return",
    track: "order.afterSale.action.track",
    reapply: "order.afterSale.action.reapply",
}

export function orderTabLabel(tab: OrderTab, t: WebTranslate): string {
    return tab === "all" ? t(ORDER_TAB_ALL_KEY) : mainProgressLabel(tab, t)
}

export const ORDER_TAB_ALL_KEY = "order.tab.all" as const satisfies WebOrderTabKey

export function orderTabEmptyText(tab: OrderTab, t: WebTranslate): string {
    const label = tab === "all" ? "" : mainProgressLabel(tab, t)
    return t("order.tabEmpty", { status: label })
}

export const ORDER_FIELD_STATUS_KEY = "order.field.status" as const satisfies WebOrderFieldKey

export const AFTER_SALE_REASON_UNSET_KEY =
    "order.afterSale.reasonUnset" as const satisfies WebAfterSaleReasonUnsetKey

type WebKey<K extends string> = Extract<WebMessageKey, K>
type WebOrderStatusKey = WebKey<`order.status.${string}`>
type WebMainProgressKey = WebKey<`order.mainProgress.${string}`>
type WebMainProgressHintKey = WebKey<`order.mainProgressHint.${string}`>
type WebOrderProgressKey = WebKey<`order.progress.${string}`>
type WebOrderActionKey = WebKey<`order.action.${string}`>
type WebOrderItemActionKey = WebKey<`order.itemAction.${string}`>
type WebOrderTabKey = WebKey<`order.tab.${string}`>
type WebOrderFieldKey = WebKey<`order.field.${string}`>
type WebAfterSaleTypeKey = WebKey<`order.afterSale.type.${string}`>
type WebAfterSaleTypeHintKey = WebKey<`order.afterSale.typeHint.${string}`>
type WebAfterSaleReasonKey = WebKey<`order.afterSale.reason.${string}`>
type WebAfterSaleTicketStatusKey = WebKey<`order.afterSale.ticketStatus.${string}`>
type WebAfterSaleActionKey = WebKey<`order.afterSale.action.${string}`>
type WebAfterSaleReasonUnsetKey = WebKey<`order.afterSale.reasonUnset`>
