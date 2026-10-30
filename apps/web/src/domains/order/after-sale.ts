import type { CaseView } from "@shop/api/sdk"

import type { MainProgress } from "./order-status"

/**
 * 售后（returns 模块）的 UI 侧判定。
 *
 * <p>契约是 `CaseView`：`type` / `status` / `reasonCode` / `responsibility` 都是裸字符串，
 * 后端枚举见 `Rma.CaseType` / `Rma.CaseStatus` / `Rma.Responsibility`。前端只做展示词表与收敛，
 * 不再复制一套强类型枚举——后端加一个状态，这里跟着加一句文案即可。
 */

export const CASE_TYPES = ["REFUND_ONLY", "RETURN_REFUND", "EXCHANGE"] as const
export type CaseType = (typeof CASE_TYPES)[number]

export const CASE_STATUSES = [
    "APPLIED",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "SHIPPING_BACK",
    "RECEIVED",
    "REFUNDING",
    "RESHIPPING",
    "COMPLETED",
    "DISPUTED",
] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const CASE_REASONS = [
    "QUALITY",
    "WRONG_ITEM",
    "MISSING_PART",
    "NOT_AS_DESCRIBED",
    "NO_LONGER_WANTED",
    "WRONG_SIZE",
    "OTHER",
] as const
export type CaseReason = (typeof CASE_REASONS)[number]

/** wire 上的 type/status/reason 是裸 string：渲染层用它收窄，认不出的码由调用点兜底展示 */
export const isCaseType = (type: string): type is CaseType =>
    CASE_TYPES.some((value) => value === type)

export const isCaseStatus = (status: string): status is CaseStatus =>
    CASE_STATUSES.some((value) => value === status)

export const isCaseReason = (reason: string): reason is CaseReason =>
    CASE_REASONS.some((value) => value === reason)

export type AfterSaleAction = "cancel" | "return" | "reapply"

/**
 * 买家侧按钮。
 *
 * <p>契约不下发 availableActions，从状态推：申请中可撤销；已同意且要寄回时可填运单；
 * 被拒后可重新申请。寄回后只看物流，不再有动作。
 */
export function buyerAfterSaleActions(c: CaseView): AfterSaleAction[] {
    const actions: AfterSaleAction[] = []
    if (c.status === "APPLIED") actions.push("cancel")
    if (c.status === "APPROVED" && needsGoodsBack(c.type)) actions.push("return")
    if (c.status === "REJECTED") actions.push("reapply")
    return actions
}

export function needsGoodsBack(type: string): boolean {
    return type !== "REFUND_ONLY"
}

export interface ApplyGate {
    status: MainProgress
}

/**
 * 能不能发起售后：已付款的订单都可以申请（行级，后端按「同一行一张未完结」拒重复）。
 * 待付款、已取消、已关闭不可申请。
 */
export function canApplyAfterSale(gate: ApplyGate): boolean {
    return gate.status === "paid" || gate.status === "partially_refunded"
}

type RefundableItem = {
    quantity: number
    shippedQuantity: number
}

/**
 * 一行最多能退几件（与后端额度同口径）：
 * 仅退款退还没发出去的货（买 − 已发），退货/换货退已发出的货。
 */
export function maxRefundQuantity(item: RefundableItem, type: CaseType): number {
    const value =
        type === "REFUND_ONLY" ? item.quantity - item.shippedQuantity : item.shippedQuantity
    return Math.max(0, value)
}

/** 打开弹窗时的默认数量：能退几件就填几件，买家改小即可 */
export function defaultRefundQuantities(
    items: readonly (RefundableItem & { lineNo: number })[],
    type: CaseType,
): Record<number, number> {
    return Object.fromEntries(
        items
            .map((item) => [item.lineNo, maxRefundQuantity(item, type)] as const)
            .filter(([, max]) => max > 0),
    )
}
