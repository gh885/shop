import type { TicketAvailableAction } from "@shop/api/sdk"

import type { RefundRowAction } from "./model"

/**
 * refund/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。
 *
 * 「一行此刻能做什么」直接消费工作台下发的 availableActions（C5b），前端不按状态推按钮表。
 */

/** 契约动作 → 行内按钮：「能做什么」吃后端下发（C5b），这里只留展示映射。动作枚举用 SDK 生成的 TicketAvailableAction（契约必填） */
const ROW_ACTION_UI: Partial<Record<TicketAvailableAction, RefundRowAction>> = {
    AGREE: "agree",
    REJECT: "reject",
    RECEIVE_RETURN: "receive",
}

/** 动作视图只吃这一列：工作台的行与订单列表批查出来的动作集（契约必填） */
export type RefundRowView = { availableActions: TicketAvailableAction[] }

/**
 * 一行售后的动作：读工作台下发的 availableActions，不按状态自推（终态行后端给空集，这里就空）。
 */
export function refundRowActions(ticket: RefundRowView): RefundRowAction[] {
    return ticket.availableActions.flatMap((action) => {
        const ui = ROW_ACTION_UI[action]
        return ui ? [ui] : []
    })
}
