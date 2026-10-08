import { z } from "zod"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import { TicketStatus } from "@shop/api/sdk"

import { TICKET_STATUS_META } from "#/order/constants"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { SaleDecisionKind } from "#/order/after-sale-decision"

/**
 * 退款售后工作台 —— 纯规则：页签定义 + 行内动作的词表与文案。
 * wire → 投影（refundRowActions）在 ./mapper.ts。
 *
 * 与售后状态机的关系：转移合法性与动作集的唯一真相都在后端（aftersale 的 TicketAction 转移表），
 * 行内动作直接消费工作台下发的 availableActions（C5b），前端不再按状态推按钮表；
 * 点了发请求，被 409 拒了按后端提示。
 */

/** 工作台页签值：售后单状态之外多一个 ALL（全部） */
export type RefundTab = (typeof TicketStatus)[keyof typeof TicketStatus] | "ALL"

/** 工作台默认页签：售后是有时效的活儿，进来先看待办 */
export const DEFAULT_REFUND_TAB: RefundTab = "APPLYING"

/**
 * URL 里的筛选值：白名单（状态枚举从 SDK 派生，后端加状态自动放行）+ 兜底到默认页签。
 * 地址栏乱填不会得到一份"不知怎么筛出来的"列表，而是安静回到待处理。
 */
// oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
export const RefundTabSchema = z
    .union([z.enum(TicketStatus), z.literal("ALL")])
    .catch(DEFAULT_REFUND_TAB)

/** 页签 → 请求参数（ALL = 不筛） */
export function refundTabToStatus(tab: RefundTab) {
    return tab === "ALL" ? undefined : tab
}

/**
 * 页签：待办在前、历史在后（工作台默认停在「待处理」），「全部」放最后当总览。
 * 文案吃 TICKET_STATUS_META（走 statusOptionsFromKeys 派生 labelKey），不在此另写一份——页签说的就是那一行的状态。
 * 句子在渲染时由 refund-tabs 组件的本端 `t` 换。
 */
export const REFUND_TABS: ReadonlyArray<
    KeyedStatusOption<
        RefundTab,
        Extract<SellerMessageKey, `order.ticketStatus.${string}`> | "order.tab.all"
    >
> = [...statusOptionsFromKeys(TICKET_STATUS_META), { value: "ALL", labelKey: "order.tab.all" }]

/** 卖家对一行售后单能做的动作——就是决策弹窗的动作种类，同一份词表不在两处各写一遍 */
export type RefundRowAction = SaleDecisionKind

/** 行内按钮文案的 key：窄联合且都是无槽位整句，`t(REFUND_ACTION_LABEL[action])` 不收第二参 */
type RefundActionKey = Extract<SellerMessageKey, `order.action.${string}`>

/** 动作按钮文案的 key（与订单列表的同一动作在这里说得更具体）；句子由消费点的本端 `t` 换 */
export const REFUND_ACTION_LABEL: Record<RefundRowAction, RefundActionKey> = {
    agree: "order.action.agree",
    reject: "order.action.reject",
    receive: "order.action.receive",
}
