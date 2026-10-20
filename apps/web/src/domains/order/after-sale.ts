import type { RefundAvailableAction, RefundType } from "@shop/api/sdk"

import type { AfterSaleBadge, OrderStatus } from "./order-status"

export type AfterSaleAction = "cancel" | "return" | "track" | "reapply"

const BUYER_ACTION_UI: Partial<Record<RefundAvailableAction, AfterSaleAction>> = {
    CANCEL: "cancel",
    RETURN_GOODS: "return",
    REAPPLY: "reapply",
}

export interface RefundActionView {
    availableActions: RefundAvailableAction[]
    returnTrackingNo: string | null
}

/**
 * 买家侧按钮：吃后端下发的动作集（状态机出边 ∩ 买家视角），前端只补两个纯导航项——
 * 「查看退货物流」按「填过运单号」自加，不走契约；按钮文案与主次留在前端。
 */
export function buyerAfterSaleActions(refund: RefundActionView): AfterSaleAction[] {
    const actions = refund.availableActions.flatMap((action) => {
        const ui = BUYER_ACTION_UI[action]
        return ui ? [ui] : []
    })
    if (actions.includes("return") && refund.returnTrackingNo) actions.push("track")
    return actions
}

export interface ApplyGate {
    status: OrderStatus
    afterSaleBadge: AfterSaleBadge
    applyExpireAt: string | null
}

/**
 * 能不能发起退款：待收货随时可申、完成后看申请窗口；有未完结退款时后端会按「同一订单行一张未完结」
 * 拒掉，按钮就不该先亮出去——点了必红不是交互。
 *
 * <p>已退款不再挡：退款是<b>行级</b>的，一单退掉部分商品后剩下的仍可再申请（与后端 apply 同口径）。
 */
export function canApplyAfterSale(gate: ApplyGate, now: number = Date.now()): boolean {
    if (gate.status !== "completed" && gate.status !== "pending_receipt") return false
    if (gate.afterSaleBadge === "refunding") return false
    if (gate.status === "pending_receipt") return true
    if (!gate.applyExpireAt) return false
    const expire = Date.parse(gate.applyExpireAt)
    return Number.isFinite(expire) && expire > now
}

type RefundableItem = {
    quantity: number
    shippedQuantity: number
    refundedQuantity: number
}

/**
 * 一行最多能退几件（与后端 §8 的两种额度同一口径）：
 * 仅退款退还没发出去的货（买 − 已发 − 已退），退货退款退已发出、寄回的货（当前有效发货量）。
 */
export function maxRefundQuantity(item: RefundableItem, type: RefundType): number {
    const value =
        type === "RETURN_REFUND"
            ? item.shippedQuantity
            : item.quantity - item.shippedQuantity - item.refundedQuantity
    return Math.max(0, value)
}

/** 打开弹窗时的默认数量：能退几件就填几件，买家改小即可（比默认 0 少两次点击） */
export function defaultRefundQuantities(
    items: readonly (RefundableItem & { orderItemId: string })[],
    type: RefundType,
): Record<string, number> {
    return Object.fromEntries(
        items
            .map((item) => [item.orderItemId, maxRefundQuantity(item, type)] as const)
            .filter(([, max]) => max > 0),
    )
}
