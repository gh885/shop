import { describe, expect, it } from "vite-plus/test"

import type { TicketResponse } from "@shop/api/sdk"
import { makeTicket } from "@shop/test-utils"

import { DECISION_TITLE, describeDecision, returnShipmentText } from "./after-sale-decision"

/**
 * 决策话术测试：卖家点下去之前读到的那一句，必须和后端真正会发生的事一致。
 *
 * 这几句是唯一一处「同意 = 什么」的说明，写错不会报错、只会让卖家批错钱，
 * 所以逐条钉：走向随 type / status 分岔、以及**没有售后单时不许断言走向**。
 */

/** 一份合法售后单（默认 APPLYING + 仅退款），用例只覆盖自己关心的那一格 */
function ticket(overrides: Partial<TicketResponse> = {}): TicketResponse {
    return makeTicket({ id: "00000000-0000-4000-8000-000000000099", ...overrides })
}

describe("describeDecision（同意这条路）", () => {
    it("仅退款：点完就退钱、商品不寄回", () => {
        expect(describeDecision("agree", ticket({ type: "REFUND_ONLY" }))).toBe(
            "同意后立即退款给买家，商品不寄回。",
        )
    })

    it("退货退款：点头只是开始等货，退款要等确认收货", () => {
        expect(describeDecision("agree", ticket({ type: "RETURN_REFUND" }))).toBe(
            "同意后进入退货流程：买家寄回、你确认收货后才退款并回补库存。",
        )
    })

    it("售后单还没到：只说「先核对」，不猜资金走向", () => {
        expect(describeDecision("agree", undefined)).toBe("请先核对售后内容再确认。")
        expect(describeDecision("agree", null)).toBe("请先核对售后内容再确认。")
    })
})

describe("describeDecision（拒绝这条路）", () => {
    it("申请阶段：拒绝不说资金的，只说买家还能重新申请", () => {
        expect(describeDecision("reject", ticket({ status: "APPLYING" }))).toBe(
            "拒绝后买家仍可在申请窗口内重新提交申请。",
        )
    })

    it("退货中：货已经寄回来了，所以要讲清退款不打、库存不回补", () => {
        expect(describeDecision("reject", ticket({ status: "RETURNING" }))).toBe(
            "拒绝后这笔退款不会打出、库存也不回补；买家仍可在申请窗口内重新提交申请。",
        )
    })

    it("没有售后单：只催填理由，不承诺买家的后路", () => {
        expect(describeDecision("reject", null)).toBe("请填写拒绝理由后再提交。")
    })
})

describe("describeDecision（确认收货）", () => {
    it("这句话不随售后单变：动作本身就说明了退款与回补库存", () => {
        expect(describeDecision("receive", null)).toBe(
            "确认后立即退款给买家并回补库存，请先核对退回的包裹。",
        )
        expect(describeDecision("receive", ticket({ status: "RETURNING" }))).toBe(
            "确认后立即退款给买家并回补库存，请先核对退回的包裹。",
        )
    })
})

describe("DECISION_TITLE", () => {
    it("三种动作的标题互不相同，且说的不是同一个词", () => {
        expect(new Set(Object.values(DECISION_TITLE)).size).toBe(3)
    })
})

describe("returnShipmentText（退货运单那一行）", () => {
    it("承运商 + 单号一起给，卖家才核得上是哪一单", () => {
        expect(
            returnShipmentText(
                ticket({ returnLogisticsCompany: "顺丰速运", returnTrackingNo: "SF1" }),
            ),
        ).toBe("顺丰速运 SF1")
    })

    it("承运商可空（回寄是手输原文）：兜一个「快递」而不是留个前导空格", () => {
        expect(returnShipmentText(ticket({ returnTrackingNo: "SF1" }))).toBe("快递 SF1")
    })

    it("还没登记运单号：说出「买家尚未登记」，而不是给一格空白", () => {
        expect(returnShipmentText(ticket({ returnTrackingNo: null }))).toBe("买家尚未登记运单号")
    })
})
