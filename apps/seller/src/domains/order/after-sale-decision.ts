import type { CaseView } from "@shop/api/sdk"

/** 本域业务规则唯一出口（rules 槽位）：售后决策的判定与语言无关推导（结构化事实）。文案 key 表在 constants.ts，出句子在调用点用 t(key) */

/** 卖家能做的四个决定。动作集由后端按售后单状态裁决，前端只在能点的行上给按钮。 */
export type SaleDecisionKind = "agree" | "reject" | "receive" | "refund"

export type DecisionCase = CaseView | null | undefined

// 决策描述的结构化事实：只说「资金/货物走向是哪种」，不说任何语言；key 映射在 constants.ts 的 DECISION_DESC_KEY
export type DecisionFactTag =
    | "agreeRefundOnly"
    | "agreeReturnRefund"
    | "reject"
    | "receive"
    | "refund"

// 没拿到售后单就不断言资金走向：宁少说一句，别在退货退款单上写「商品不寄回」
export function decisionFactTag(kind: SaleDecisionKind, rma: DecisionCase): DecisionFactTag {
    if (kind === "reject") return "reject"
    if (kind === "receive") return "receive"
    if (kind === "refund") return "refund"
    if (!rma) return "agreeRefundOnly"
    return rma.type === "return_refund" ? "agreeReturnRefund" : "agreeRefundOnly"
}

/**
 * 售后单当前状态下能做的动作。后端没有「可用动作」下发字段，状态机在这里表达：
 * 只能从 `applied` 批/驳，从 `shipping_back` 收货，从 `received` 确认退款。
 */
export function availableDecisions(rma: DecisionCase): SaleDecisionKind[] {
    if (!rma) return []
    switch (rma.status) {
        case "applied": {
            return ["agree", "reject"]
        }
        case "shipping_back": {
            return ["receive"]
        }
        case "received": {
            return ["refund"]
        }
        default: {
            return []
        }
    }
}
