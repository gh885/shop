import type { RefundResponse } from "@shop/api/sdk"

import type { SellerMessageKey } from "#/locales/messages.gen"

export type SaleDecisionKind = "agree" | "reject" | "receive" | "intercept" | "retry"

type DecisionTitleKey = Extract<SellerMessageKey, `order.decision.title.${string}`>
type DecisionDescKey = Extract<SellerMessageKey, `order.decision.desc.${string}`>

export const DECISION_TITLE: Record<SaleDecisionKind, DecisionTitleKey> = {
    agree: "order.decision.title.agree",
    reject: "order.decision.title.reject",
    receive: "order.decision.title.receive",
    intercept: "order.decision.title.intercept",
    retry: "order.decision.title.retry",
}

export type DecisionRefund = RefundResponse | null | undefined

// 没拿到退款单就不断言资金走向：宁少说一句，别在退货退款单上写「商品不寄回」
export function describeDecision(kind: SaleDecisionKind, refund: DecisionRefund): DecisionDescKey {
    if (kind === "reject") {
        return refund ? "order.decision.desc.rejectOther" : "order.decision.desc.rejectNoTicket"
    }
    if (kind === "receive") return "order.decision.desc.receive"
    if (kind === "intercept") return "order.decision.desc.intercept"
    if (kind === "retry") return "order.decision.desc.retry"
    if (!refund) return "order.decision.desc.agreeNoTicket"
    return refund.type === "RETURN_REFUND"
        ? "order.decision.desc.agreeReturnRefund"
        : "order.decision.desc.agreeRefundOnly"
}

export const RETURN_CARRIER_FALLBACK_KEY = "order.decision.defaultCarrier" as const

export const NO_RETURN_TRACKING_KEY = "order.decision.noReturnTracking" as const

// 退货运单：承运商/单号是动态内容不翻译，兜底文案由调用点传入（本层不认语言）
export function returnShipmentText(
    refund: RefundResponse,
    carrierFallback = "",
    notRegisteredLabel = "",
): string {
    if (!refund.returnTrackingNo) return notRegisteredLabel
    return `${refund.returnCarrierName ?? carrierFallback} ${refund.returnTrackingNo}`
}
