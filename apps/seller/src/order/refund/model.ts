import { z } from "zod"
import { TicketStatus, type SellerTicketItem, type TicketAvailableAction } from "@shop/api/sdk"

/**
 * 退款售后工作台 —— 纯规则：页签定义 + 「一行此刻能做什么」。
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

/** 页签：待办在前、历史在后（工作台默认停在「待处理」），「全部」放最后当总览 */
export const REFUND_TABS: ReadonlyArray<{ value: RefundTab; label: string }> = [
    { value: "APPLYING", label: "待处理" },
    { value: "RETURNING", label: "退货中" },
    { value: "REFUNDED", label: "已退款" },
    { value: "REJECTED", label: "已拒绝" },
    { value: "CLOSED", label: "已撤销" },
    { value: "ALL", label: "全部" },
]

/** 卖家对一行售后单能做的动作 */
export type RefundRowAction = "agree" | "reject" | "receive"

/** 契约动作 → 行内按钮：「能做什么」吃后端下发（C5b），这里只留文案与展示映射。动作枚举用 SDK 生成的 TicketAvailableAction（契约必填） */
const ROW_ACTION_UI: Partial<Record<TicketAvailableAction, RefundRowAction>> = {
    AGREE: "agree",
    REJECT: "reject",
    RECEIVE_RETURN: "receive",
}

/**
 * 一行售后的动作视图：SellerTicketItem 上消费动作所需的两列（都是契约必填，直接 Pick）。
 * status 不参与判定，只是契约形状在这里保持完整。
 */
export type RefundRowView = Pick<SellerTicketItem, "status" | "availableActions">

/**
 * 卖家对一行售后单能做的动作——读行上下发的 availableActions，不按状态自推：
 * - 待处理 → 同意 / 拒绝（仅退款同意即退款，退货退款同意后转「退货中」，分派也在后端）
 * - 退货中 → 确认收货（之后才退款并回补库存）
 * - 终态 → 后端给空集，这里就空（已退款/已拒绝/已撤销都是历史）
 */
export function refundRowActions(ticket: RefundRowView): RefundRowAction[] {
    return ticket.availableActions.flatMap((action) => {
        const ui = ROW_ACTION_UI[action]
        return ui ? [ui] : []
    })
}

/** 动作按钮文案（工作台上的动作比订单列表更明确：那里是「同意」，这里是「同意退款」） */
export const REFUND_ACTION_LABEL: Record<RefundRowAction, string> = {
    agree: "同意",
    reject: "拒绝",
    receive: "确认收货",
}
