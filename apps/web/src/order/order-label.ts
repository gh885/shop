import type { OrderAction, OrderStatus } from "./model"
import type { OrderTab } from "./orders-search"
import type { AfterSaleAction } from "./after-sale"
import type { AfterSaleReason, TicketStatus, TicketType } from "@shop/api/sdk"

import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"

/**
 * 订单域的**文案查表**：码值 → `t()` 出的句子。
 *
 * **为什么从 `constants.ts` 搬出来**：那张表混着两件事——「显示什么颜色、什么顺序」（纯结构，
 * 与语言无关）和「显示哪句话」（文案）。文案那半必须进 catalog（i18n §4.2：文案归 catalog，
 * 代码不感知当前有几种语言），结构那半留在 `constants.ts`。拆开的判据是**换语言会不会变**。
 *
 * **穷尽性没有被削弱**：下面每一张表仍然是 `Record<码值, key>` 而不是 `Partial<Record<…>>`——
 * 后端新增一个状态/动作/原因时，这里先编译期报错，一路逼着补 key（这与改造前 `constants.ts` 那几张
 * `Record` 的作用完全一样，只是错从「忘了写中文」变成「忘了登记 key」）。
 *
 * **key 的形状是 `{域}.{表}.{码值}`**，码值原样出现在 key 里（`order.status.pending_payment`），
 * 好处是查表与排查都按码值走，不必反查句子；坏处是码值改名要改 key（`i18n:drift` 会立刻报）。
 */
export function orderStatusLabel(status: OrderStatus, t: WebTranslate): string {
    return t(ORDER_STATUS_KEY[status])
}

const ORDER_STATUS_KEY: Record<OrderStatus, WebOrderStatusKey> = {
    pending_payment: "order.status.pending_payment",
    pending_shipment: "order.status.pending_shipment",
    pending_receipt: "order.status.pending_receipt",
    completed: "order.status.completed",
    cancelled: "order.status.cancelled",
}

/** 订单卡片那句状态提示（与色板同表，见 `ORDER_CARD_STATUS_META.tone`） */
export function orderCardHint(status: OrderStatus, t: WebTranslate): string {
    return t(ORDER_CARD_HINT_KEY[status])
}

const ORDER_CARD_HINT_KEY: Record<OrderStatus, WebOrderCardHintKey> = {
    pending_payment: "order.cardHint.pending_payment",
    pending_shipment: "order.cardHint.pending_shipment",
    pending_receipt: "order.cardHint.pending_receipt",
    completed: "order.cardHint.completed",
    cancelled: "order.cardHint.cancelled",
}

/** 进度条四步：按下标取（步骤顺序是 `ORDER_PROGRESS_STEPS` 的事，这里只出句子） */
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

/** 全量动作 → key。导出是为了让完整性测试能断言「展示顺序表覆盖了每一个动作」——
 *  它本身已被 `orderActionLabel` 消费，不是给测试单开的旁路。 */
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

export function orderItemActionLabel(key: string, t: WebTranslate): string {
    return t(ORDER_ITEM_ACTION_KEY[key] ?? "order.itemAction.add_cart")
}

const ORDER_ITEM_ACTION_KEY: Record<string, WebOrderItemActionKey> = {
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

/**
 * 列表页签的标签：`all` 走自己那条，其余四个直接复用状态名——页签与卡片说同一句话，
 * 不另写一份（那是拆成两张表时最容易漏的一处）。
 */
export function orderTabLabel(tab: OrderTab, t: WebTranslate): string {
    return tab === "all" ? t(ORDER_TAB_ALL_KEY) : orderStatusLabel(tab, t)
}

/** 页签「全部」那一条（其余四条直接用 `orderStatusLabel`，不另写一份中文） */
export const ORDER_TAB_ALL_KEY = "order.tab.all" as const satisfies WebOrderTabKey

/** 列表空态：「暂无{status}订单」——`status` 槽位接页签那个状态名 */
export function orderTabEmptyText(status: OrderStatus | "all", t: WebTranslate): string {
    const label = status === "all" ? "" : orderStatusLabel(status, t)
    return t("order.tabEmpty", { status: label })
}

/** 详情里「订单状态」那行的字段名 */
export const ORDER_FIELD_STATUS_KEY = "order.field.status" as const satisfies WebOrderFieldKey

/** 售后卡上「未选择」（老券卡那类缺省占位） */
export const AFTER_SALE_REASON_UNSET_KEY =
    "order.afterSale.reasonUnset" as const satisfies WebAfterSaleReasonUnsetKey

/* key 的类型别名：让上面的 Record 在**写错 key 名**时立刻红，而不是运行到那个码值才回落成 key 本身。
   这些别名由 `Messages.gen` 的 `WebMessageKey` 派生（见文件末尾的 satisfies 断言）。 */
type WebKey<K extends string> = Extract<WebMessageKey, K>
type WebOrderStatusKey = WebKey<`order.status.${string}`>
type WebOrderCardHintKey = WebKey<`order.cardHint.${string}`>
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
