import type { RefundAvailableAction } from "@shop/api/sdk"

import type { RefundRowAction } from "./model"

// 契约动作 → 行内按钮：吃后端下发的 availableActions（C5b），这里只留展示映射
const ROW_ACTION_UI: Partial<Record<RefundAvailableAction, RefundRowAction>> = {
    AGREE: "agree",
    REJECT: "reject",
    RECEIVE_RETURN: "receive",
    INTERCEPT: "intercept",
    RETRY: "retry",
}

export type RefundRowView = { availableActions: RefundAvailableAction[] }

export function refundRowActions(refund: RefundRowView): RefundRowAction[] {
    return refund.availableActions.flatMap((action) => {
        const ui = ROW_ACTION_UI[action]
        return ui ? [ui] : []
    })
}
