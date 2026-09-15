import { z } from "zod"
import { TicketStatus } from "@shop/api/sdk"

/**
 * 退款售后工作台 —— 纯规则：页签定义 + 「一行此刻能做什么」。
 *
 * 与售后状态机的关系：状态机唯一真相在后端（aftersale 的 TicketAction 转移表），
 * 这里只把「卖家视角的动作」按状态读出来，不复制转移合法性——点了发请求，被 409 拒了按后端提示。
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

/**
 * 按售后单状态给出可执行动作：
 * - 待处理 → 同意 / 拒绝（仅退款同意即退款，退货退款同意后转「退货中」）
 * - 退货中 → 确认收货（之后才退款并回补库存）
 * - 终态 → 无动作（已退款/已拒绝/已撤销都是历史）
 */
export function refundRowActions(status: TicketStatus): RefundRowAction[] {
    if (status === "APPLYING") return ["agree", "reject"]
    if (status === "RETURNING") return ["receive"]
    return []
}

/** 动作按钮文案（工作台上的动作比订单列表更明确：那里是「同意」，这里是「同意退款」） */
export const REFUND_ACTION_LABEL: Record<RefundRowAction, string> = {
    agree: "同意",
    reject: "拒绝",
    receive: "确认收货",
}
