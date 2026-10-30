import type { MainProgress, OrderAction, OrderItemAction } from "./rules"
import type { OrderTab } from "./search"
import type { AfterSaleAction, CaseReason, CaseStatus, CaseType } from "./after-sale"
import { isCaseReason, isCaseStatus, isCaseType } from "./after-sale"

import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"

/** 主进度文案：卡片徽章与页签共用一套词 */
export function mainProgressLabel(progress: MainProgress, t: WebTranslate): string {
    return t(MAIN_PROGRESS_KEY[progress])
}

const MAIN_PROGRESS_KEY: Record<MainProgress, WebMainProgressKey> = {
    pending_payment: "order.mainProgress.pending_payment",
    paid: "order.mainProgress.paid",
    partially_refunded: "order.mainProgress.partially_refunded",
    refunded: "order.mainProgress.refunded",
    cancelled: "order.mainProgress.cancelled",
    closed: "order.mainProgress.closed",
}

/** 卡片上的一句话说明：告诉买家「现在该等什么」，不长于一行 */
export function mainProgressHint(progress: MainProgress, t: WebTranslate): string {
    return t(MAIN_PROGRESS_HINT_KEY[progress])
}

const MAIN_PROGRESS_HINT_KEY: Record<MainProgress, WebMainProgressHintKey> = {
    pending_payment: "order.mainProgressHint.pending_payment",
    paid: "order.mainProgressHint.paid",
    partially_refunded: "order.mainProgressHint.partially_refunded",
    refunded: "order.mainProgressHint.refunded",
    cancelled: "order.mainProgressHint.cancelled",
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
    rebuy: "order.action.rebuy",
    add_cart: "order.action.add_cart",
}

export function orderItemActionLabel(action: OrderItemAction, t: WebTranslate): string {
    return t(ORDER_ITEM_ACTION_KEY[action])
}

const ORDER_ITEM_ACTION_KEY: Record<OrderItemAction, WebOrderItemActionKey> = {
    add_cart: "order.itemAction.add_cart",
    after_sale: "order.itemAction.after_sale",
}

/**
 * 券类型/状态/原因的展示词。入参收宽成 wire 的裸 string：调用点拿的是契约字段（自由 string），
 * 未知码（后端加了新态、历史单）回退显示原码——宁可显示得保守，也不让调用点各自断言收窄。
 */
export function afterSaleTypeLabel(type: string, t: WebTranslate): string {
    return isCaseType(type) ? t(AFTER_SALE_TYPE_KEY[type]) : type
}

const AFTER_SALE_TYPE_KEY: Record<CaseType, WebAfterSaleTypeKey> = {
    REFUND_ONLY: "order.afterSale.type.REFUND_ONLY",
    RETURN_REFUND: "order.afterSale.type.RETURN_REFUND",
    EXCHANGE: "order.afterSale.type.EXCHANGE",
}

export function afterSaleTypeHint(type: string, t: WebTranslate): string {
    return isCaseType(type) ? t(AFTER_SALE_TYPE_HINT_KEY[type]) : type
}

const AFTER_SALE_TYPE_HINT_KEY: Record<CaseType, WebAfterSaleTypeHintKey> = {
    REFUND_ONLY: "order.afterSale.typeHint.REFUND_ONLY",
    RETURN_REFUND: "order.afterSale.typeHint.RETURN_REFUND",
    EXCHANGE: "order.afterSale.typeHint.EXCHANGE",
}

export function afterSaleReasonLabel(reason: string, t: WebTranslate): string {
    return isCaseReason(reason) ? t(AFTER_SALE_REASON_KEY[reason]) : reason
}

const AFTER_SALE_REASON_KEY: Record<CaseReason, WebAfterSaleReasonKey> = {
    QUALITY: "order.afterSale.reason.QUALITY",
    WRONG_ITEM: "order.afterSale.reason.WRONG_ITEM",
    MISSING_PART: "order.afterSale.reason.MISSING_PART",
    NOT_AS_DESCRIBED: "order.afterSale.reason.NOT_AS_DESCRIBED",
    NO_LONGER_WANTED: "order.afterSale.reason.NO_LONGER_WANTED",
    WRONG_SIZE: "order.afterSale.reason.WRONG_SIZE",
    OTHER: "order.afterSale.reason.OTHER",
}

export function caseStatusLabel(status: string, t: WebTranslate): string {
    return isCaseStatus(status) ? t(CASE_STATUS_KEY[status]) : status
}

const CASE_STATUS_KEY: Record<CaseStatus, WebCaseStatusKey> = {
    APPLIED: "order.afterSale.status.APPLIED",
    APPROVED: "order.afterSale.status.APPROVED",
    REJECTED: "order.afterSale.status.REJECTED",
    CANCELLED: "order.afterSale.status.CANCELLED",
    SHIPPING_BACK: "order.afterSale.status.SHIPPING_BACK",
    RECEIVED: "order.afterSale.status.RECEIVED",
    REFUNDING: "order.afterSale.status.REFUNDING",
    RESHIPPING: "order.afterSale.status.RESHIPPING",
    COMPLETED: "order.afterSale.status.COMPLETED",
    DISPUTED: "order.afterSale.status.DISPUTED",
}

export function afterSaleActionLabel(action: AfterSaleAction, t: WebTranslate): string {
    return t(AFTER_SALE_ACTION_KEY[action])
}

const AFTER_SALE_ACTION_KEY: Record<AfterSaleAction, WebAfterSaleActionKey> = {
    cancel: "order.afterSale.action.cancel",
    return: "order.afterSale.action.return",
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

type WebKey<K extends string> = Extract<WebMessageKey, K>
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
type WebCaseStatusKey = WebKey<`order.afterSale.status.${string}`>
type WebAfterSaleActionKey = WebKey<`order.afterSale.action.${string}`>
