import type { TicketAvailableAction } from "@shop/api/sdk"

import type { RefundRowAction } from "./model"

// 契约动作 → 行内按钮：吃后端下发的 availableActions（C5b），这里只留展示映射
const ROW_ACTION_UI: Partial<Record<TicketAvailableAction, RefundRowAction>> = {
    AGREE: "agree",
    REJECT: "reject",
    RECEIVE_RETURN: "receive",
}

export type RefundRowView = { availableActions: TicketAvailableAction[] }

export function refundRowActions(ticket: RefundRowView): RefundRowAction[] {
    return ticket.availableActions.flatMap((action) => {
        const ui = ROW_ACTION_UI[action]
        return ui ? [ui] : []
    })
}
