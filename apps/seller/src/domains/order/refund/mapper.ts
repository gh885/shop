import type { RefundAvailableAction } from "@shop/api/sdk"

import type { SaleDecisionKind } from "#/domains/order/after-sale-decision"

/** 退款行内动作的视图出口（mapper 槽位）：契约动作 → 行内动作。行内动作即决策动作枚举，前端不自推按钮表 */

export type RefundRowAction = SaleDecisionKind

// 退款状态机的转移合法性与动作集唯一真相在后端：行内动作直接吃下发的 availableActions（C5b），这里只留展示映射
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
