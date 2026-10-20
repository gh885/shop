import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import { REFUND_STATUS_META } from "#/domains/order/constants"
import type { SellerMessageKey } from "#/locales/messages.gen"

import type { RefundRowAction } from "./mapper"
import type { RefundTab } from "./search"

/** 退款页展示词表（纯数据）：页签顺序表与行内动作 → 文案 key。URL 契约在 search.ts，契约→动作映射在 mapper.ts */

export const REFUND_TABS: ReadonlyArray<
    KeyedStatusOption<
        RefundTab,
        Extract<SellerMessageKey, `order.refundStatus.${string}`> | "order.tab.all"
    >
> = [...statusOptionsFromKeys(REFUND_STATUS_META), { value: "ALL", labelKey: "order.tab.all" }]

type RefundActionKey = Extract<SellerMessageKey, `order.action.${string}`>

export const REFUND_ACTION_LABEL: Record<RefundRowAction, RefundActionKey> = {
    agree: "order.action.agree",
    reject: "order.action.reject",
    receive: "order.action.receive",
    intercept: "order.action.intercept",
    retry: "order.action.retry",
}
