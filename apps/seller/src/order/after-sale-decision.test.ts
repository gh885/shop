import { describe, expect, it } from "vite-plus/test"

import type { RefundResponse } from "@shop/api/sdk"
import { makeTicket } from "@shop/test-utils"

import { decisionFactTag, returnShipmentText } from "./after-sale-decision"
import { DECISION_DESC_KEY } from "./constants"

function refund(overrides: Partial<RefundResponse> = {}): RefundResponse {
    return makeTicket({ id: "00000000-0000-4000-8000-000000000099", ...overrides })
}

// fact 推导 + constants 的 key 表接线，两段合起来钉住「决策弹窗说的是哪句话」
describe("decisionFactTag（同意这条路）", () => {
    it("仅退款：点完就退钱、商品不寄回", () => {
        expect(DECISION_DESC_KEY[decisionFactTag("agree", refund({ type: "REFUND_ONLY" }))]).toBe(
            "order.decision.desc.agreeRefundOnly",
        )
    })

    it("退货退款：点头只是开始等货，退款要等确认收货", () => {
        expect(DECISION_DESC_KEY[decisionFactTag("agree", refund({ type: "RETURN_REFUND" }))]).toBe(
            "order.decision.desc.agreeReturnRefund",
        )
    })

    it("退款单还没到：只说「先核对」，不猜资金走向", () => {
        expect(DECISION_DESC_KEY[decisionFactTag("agree", undefined)]).toBe(
            "order.decision.desc.agreeNoTicket",
        )
        expect(DECISION_DESC_KEY[decisionFactTag("agree", null)]).toBe(
            "order.decision.desc.agreeNoTicket",
        )
    })
})

describe("decisionFactTag（拒绝这条路）", () => {
    it("拒绝：不说资金的，只说买家还能重新申请", () => {
        expect(DECISION_DESC_KEY[decisionFactTag("reject", refund({ status: "PENDING" }))]).toBe(
            "order.decision.desc.rejectOther",
        )
    })

    it("没有退款单：只催填理由，不承诺买家的后路", () => {
        expect(DECISION_DESC_KEY[decisionFactTag("reject", null)]).toBe(
            "order.decision.desc.rejectNoTicket",
        )
    })
})

describe("decisionFactTag（已寄回的两条相反出口与人工重试）", () => {
    it("确认收货：退款并回补库存", () => {
        expect(DECISION_DESC_KEY[decisionFactTag("receive", null)]).toBe(
            "order.decision.desc.receive",
        )
    })

    it("确认拦截：货不退回、钱不出", () => {
        expect(
            DECISION_DESC_KEY[decisionFactTag("intercept", refund({ status: "RETURNED" }))],
        ).toBe("order.decision.desc.intercept")
    })

    it("重试：自动重试耗尽的出口", () => {
        expect(DECISION_DESC_KEY[decisionFactTag("retry", refund({ status: "FAILED" }))]).toBe(
            "order.decision.desc.retry",
        )
    })
})

describe("returnShipmentText（退货运单那一行）", () => {
    it("承运商 + 单号一起给，卖家才核得上是哪一单", () => {
        expect(
            returnShipmentText(
                refund({ returnCarrierName: "顺丰速运", returnTrackingNo: "SF1" }),
                "快递",
                "买家尚未登记运单号",
            ),
        ).toBe("顺丰速运 SF1")
    })

    it("承运商可空（回寄是手输原文）：用调用点传入的兜底词，而不是留个前导空格", () => {
        expect(
            returnShipmentText(refund({ returnTrackingNo: "SF1" }), "快递", "买家尚未登记运单号"),
        ).toBe("快递 SF1")
    })

    it("还没登记运单号：回调用点给的「尚未登记」那句，而不是给一格空白", () => {
        expect(
            returnShipmentText(refund({ returnTrackingNo: null }), "快递", "买家尚未登记运单号"),
        ).toBe("买家尚未登记运单号")
    })
})
