import type { RefundResponse } from "@shop/api/sdk"

/** 本域业务规则唯一出口（rules 槽位）：售后决策的判定与语言无关推导（结构化事实）。文案 key 表在 constants.ts，出句子在调用点用 t(key)；对照 app-kit couponRuleFact→couponRuleText 的 fact/text 分家 */

export type SaleDecisionKind = "agree" | "reject" | "receive" | "intercept" | "retry"

export type DecisionRefund = RefundResponse | null | undefined

// 决策描述的结构化事实：只说「资金/货物走向是哪种」，不说任何语言；key 映射在 constants.ts 的 DECISION_DESC_KEY
export type DecisionFactTag =
    | "agreeRefundOnly"
    | "agreeReturnRefund"
    | "agreeNoTicket"
    | "rejectOther"
    | "rejectNoTicket"
    | "receive"
    | "intercept"
    | "retry"

// 没拿到退款单就不断言资金走向：宁少说一句，别在退货退款单上写「商品不寄回」
export function decisionFactTag(kind: SaleDecisionKind, refund: DecisionRefund): DecisionFactTag {
    if (kind === "reject") {
        return refund ? "rejectOther" : "rejectNoTicket"
    }
    if (kind === "receive") return "receive"
    if (kind === "intercept") return "intercept"
    if (kind === "retry") return "retry"
    if (!refund) return "agreeNoTicket"
    return refund.type === "RETURN_REFUND" ? "agreeReturnRefund" : "agreeRefundOnly"
}

// 退货运单：承运商/单号是动态内容不翻译，兜底文案由调用点传入（本层不认语言）
export function returnShipmentText(
    refund: RefundResponse,
    carrierFallback = "",
    notRegisteredLabel = "",
): string {
    if (!refund.returnTrackingNo) return notRegisteredLabel
    return `${refund.returnCarrierName ?? carrierFallback} ${refund.returnTrackingNo}`
}
