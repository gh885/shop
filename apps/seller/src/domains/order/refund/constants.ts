import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import { RMA_STATUS_META } from "#/domains/order/constants"
import type { SellerMessageKey } from "#/locales/messages.gen"

import type { RmaRowAction } from "./mapper"

/** 售后工作台展示词表（纯数据）：页签顺序表与行内动作 → 文案 key。URL 契约在 search.ts，动作集在 rules 槽位 */

export const RMA_TABS: ReadonlyArray<
    KeyedStatusOption<
        keyof typeof RMA_STATUS_META | "ALL",
        Extract<SellerMessageKey, `order.rmaStatus.${string}`> | "order.tab.all"
    >
> = [...statusOptionsFromKeys(RMA_STATUS_META), { value: "ALL", labelKey: "order.tab.all" }]

type RmaActionKey = Extract<SellerMessageKey, `order.action.${string}`>

export const RMA_ACTION_LABEL: Record<RmaRowAction, RmaActionKey> = {
    agree: "order.action.agree",
    reject: "order.action.reject",
    receive: "order.action.receive",
    refund: "order.action.refund",
    reship: "order.action.reship",
}
