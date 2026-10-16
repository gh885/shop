import type { TicketResponse } from "@shop/api/sdk"

import type { SellerMessageKey } from "#/locales/messages.gen"

export type SaleDecisionKind = "agree" | "reject" | "receive"

type DecisionTitleKey = Extract<SellerMessageKey, `order.decision.title.${string}`>
type DecisionDescKey = Extract<SellerMessageKey, `order.decision.desc.${string}`>

export const DECISION_TITLE: Record<SaleDecisionKind, DecisionTitleKey> = {
    agree: "order.decision.title.agree",
    reject: "order.decision.title.reject",
    receive: "order.decision.title.receive",
}

export type DecisionTicket = TicketResponse | null | undefined

// 没拿到售后单就不断言资金走向：宁少说一句，别在退货退款单上写「商品不寄回」
export function describeDecision(kind: SaleDecisionKind, ticket: DecisionTicket): DecisionDescKey {
    if (kind === "reject") {
        if (!ticket) return "order.decision.desc.rejectNoTicket"
        return ticket.status === "RETURNING"
            ? "order.decision.desc.rejectReturning"
            : "order.decision.desc.rejectOther"
    }
    if (kind === "receive") return "order.decision.desc.receive"
    if (!ticket) return "order.decision.desc.agreeNoTicket"
    return ticket.type === "RETURN_REFUND"
        ? "order.decision.desc.agreeReturnRefund"
        : "order.decision.desc.agreeRefundOnly"
}

export const RETURN_CARRIER_FALLBACK_KEY = "order.decision.defaultCarrier" as const

export const NO_RETURN_TRACKING_KEY = "order.decision.noReturnTracking" as const

// 退货运单：承运商/单号是动态内容不翻译，兜底文案由调用点传入（本层不认语言）
export function returnShipmentText(
    ticket: TicketResponse,
    carrierFallback = "",
    notRegisteredLabel = "",
): string {
    if (!ticket.returnTrackingNo) return notRegisteredLabel
    return `${ticket.returnLogisticsCompany ?? carrierFallback} ${ticket.returnTrackingNo}`
}
