import type { AfterSaleStatus, TicketAvailableAction } from "@shop/api/sdk"

import type { OrderStatus } from "./order-status"

export type AfterSaleAction = "cancel" | "return" | "track" | "reapply"

const BUYER_ACTION_UI: Partial<Record<TicketAvailableAction, AfterSaleAction>> = {
    CANCEL: "cancel",
    RETURN_GOODS: "return",
    REAPPLY: "reapply",
}

export interface AfterSaleTicketView {
    availableActions: TicketAvailableAction[]
    returnTrackingNo: string | null
}

export function buyerAfterSaleActions(ticket: AfterSaleTicketView): AfterSaleAction[] {
    const actions = ticket.availableActions.flatMap((action) => {
        const ui = BUYER_ACTION_UI[action]
        return ui ? [ui] : []
    })
    if (actions.includes("return") && ticket.returnTrackingNo) actions.push("track")
    return actions
}

export interface ApplyGate {
    status: OrderStatus
    afterSaleStatus: AfterSaleStatus
    applyExpireAt: string | null
}

const OPEN_STATUS: ReadonlySet<AfterSaleStatus> = new Set(["APPLYING", "RETURNING"])

export function canApplyAfterSale(gate: ApplyGate, now: number = Date.now()): boolean {
    if (gate.status !== "completed" && gate.status !== "pending_receipt") return false
    if (OPEN_STATUS.has(gate.afterSaleStatus)) return false
    if (gate.afterSaleStatus === "REFUNDED") return false
    if (gate.status === "pending_receipt") return true
    if (!gate.applyExpireAt) return false
    const expire = Date.parse(gate.applyExpireAt)
    return Number.isFinite(expire) && expire > now
}
