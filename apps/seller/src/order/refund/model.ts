import { z } from "zod"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import { TicketStatus } from "@shop/api/sdk"

import { TICKET_STATUS_META } from "#/order/constants"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { SaleDecisionKind } from "#/order/after-sale-decision"

// 售后状态机的转移合法性与动作集唯一真相在后端：行内动作直接吃下发的 availableActions（C5b），前端不自推按钮表
export type RefundTab = (typeof TicketStatus)[keyof typeof TicketStatus] | "ALL"

export const DEFAULT_REFUND_TAB: RefundTab = "APPLYING"

// URL 筛选值白名单 + 兜底到默认页签：地址栏乱填不会拿到一份"不知怎么筛出来的"列表
// oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
export const RefundTabSchema = z
    .union([z.enum(TicketStatus), z.literal("ALL")])
    .catch(DEFAULT_REFUND_TAB)

export function refundTabToStatus(tab: RefundTab) {
    return tab === "ALL" ? undefined : tab
}

export const REFUND_TABS: ReadonlyArray<
    KeyedStatusOption<
        RefundTab,
        Extract<SellerMessageKey, `order.ticketStatus.${string}`> | "order.tab.all"
    >
> = [...statusOptionsFromKeys(TICKET_STATUS_META), { value: "ALL", labelKey: "order.tab.all" }]

export type RefundRowAction = SaleDecisionKind

type RefundActionKey = Extract<SellerMessageKey, `order.action.${string}`>

export const REFUND_ACTION_LABEL: Record<RefundRowAction, RefundActionKey> = {
    agree: "order.action.agree",
    reject: "order.action.reject",
    receive: "order.action.receive",
}
