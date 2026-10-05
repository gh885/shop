import { describe, expect, it } from "vite-plus/test"

import type { TicketResponse } from "@shop/api/sdk"
import { makeTicket } from "@shop/test-utils"

import { describeDecision, returnShipmentText } from "./after-sale-decision"

/**
 * 决策话术测试：卖家点下去之前读到的那一句，必须和后端真正会发生的事一致。
 *
 * 纯层发事实（§6）：`describeDecision` 现在交出的是**选对分支的 catalog key**，句子由弹窗在渲染
 * 边界 `t` 出来。所以这里钉的是**「哪种售后单选哪一句」的分支逻辑**——写错不会报错、只会让卖家批
 * 错钱，走向随 type / status 分岔、以及**没有售后单时不许断言走向**。key 拼错本身由
 * `DecisionDescKey` 的类型标注在编译期拦（§10.2），这里的运行时价值在分支，不在字符串。
 */

/** 一份合法售后单（默认 APPLYING + 仅退款），用例只覆盖自己关心的那一格 */
function ticket(overrides: Partial<TicketResponse> = {}): TicketResponse {
    return makeTicket({ id: "00000000-0000-4000-8000-000000000099", ...overrides })
}

describe("describeDecision（同意这条路）", () => {
    it("仅退款：点完就退钱、商品不寄回", () => {
        expect(describeDecision("agree", ticket({ type: "REFUND_ONLY" }))).toBe(
            "seller.order.decision.desc.agreeRefundOnly",
        )
    })

    it("退货退款：点头只是开始等货，退款要等确认收货", () => {
        expect(describeDecision("agree", ticket({ type: "RETURN_REFUND" }))).toBe(
            "seller.order.decision.desc.agreeReturnRefund",
        )
    })

    it("售后单还没到：只说「先核对」，不猜资金走向", () => {
        expect(describeDecision("agree", undefined)).toBe(
            "seller.order.decision.desc.agreeNoTicket",
        )
        expect(describeDecision("agree", null)).toBe("seller.order.decision.desc.agreeNoTicket")
    })
})

describe("describeDecision（拒绝这条路）", () => {
    it("申请阶段：拒绝不说资金的，只说买家还能重新申请", () => {
        expect(describeDecision("reject", ticket({ status: "APPLYING" }))).toBe(
            "seller.order.decision.desc.rejectOther",
        )
    })

    it("退货中：货已经寄回来了，所以要讲清退款不打、库存不回补", () => {
        expect(describeDecision("reject", ticket({ status: "RETURNING" }))).toBe(
            "seller.order.decision.desc.rejectReturning",
        )
    })

    it("没有售后单：只催填理由，不承诺买家的后路", () => {
        expect(describeDecision("reject", null)).toBe("seller.order.decision.desc.rejectNoTicket")
    })
})

describe("describeDecision（确认收货）", () => {
    it("这句话不随售后单变：动作本身就说明了退款与回补库存", () => {
        expect(describeDecision("receive", null)).toBe("seller.order.decision.desc.receive")
        expect(describeDecision("receive", ticket({ status: "RETURNING" }))).toBe(
            "seller.order.decision.desc.receive",
        )
    })
})

describe("returnShipmentText（退货运单那一行）", () => {
    it("承运商 + 单号一起给，卖家才核得上是哪一单", () => {
        expect(
            returnShipmentText(
                ticket({ returnLogisticsCompany: "顺丰速运", returnTrackingNo: "SF1" }),
                "快递",
                "买家尚未登记运单号",
            ),
        ).toBe("顺丰速运 SF1")
    })

    it("承运商可空（回寄是手输原文）：用调用点传入的兜底词，而不是留个前导空格", () => {
        expect(
            returnShipmentText(ticket({ returnTrackingNo: "SF1" }), "快递", "买家尚未登记运单号"),
        ).toBe("快递 SF1")
    })

    it("还没登记运单号：回调用点给的「尚未登记」那句，而不是给一格空白", () => {
        expect(
            returnShipmentText(ticket({ returnTrackingNo: null }), "快递", "买家尚未登记运单号"),
        ).toBe("买家尚未登记运单号")
    })
})
