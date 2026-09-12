import { describe, expect, it } from "vitest"

import {
    AFTER_SALE_TYPE_LABEL,
    TICKET_STATUS_LABEL,
    buyerAfterSaleActions,
    canApplyAfterSale,
    toAfterSaleTicket,
} from "./after-sale"
import type { ApplyGate } from "./after-sale"

/**
 * 售后纯规则测试：不问「后端会怎么判」，只问「前端会不会把用户送到一条必然失败的路上」。
 *
 * 夹具 makeGate 只暴露该测试关心的三个维度（订单状态 / 售后投影 / 申请截止），
 * 其余契约字段与判定无关，不进夹具。
 */
function makeGate(overrides: Partial<ApplyGate> = {}): ApplyGate {
    return {
        status: "completed",
        afterSaleStatus: "NONE",
        applyExpireAt: "2026-01-10T00:00:00Z",
        ...overrides,
    }
}

const NOW = Date.parse("2026-01-05T00:00:00Z")

describe("buyerAfterSaleActions（买家此刻能做什么）", () => {
    it("待卖家处理_给撤销入口：一旦卖家同意，货/钱已在途，撤销口子就关了", () => {
        expect(buyerAfterSaleActions({ status: "APPLYING", returnTrackingNo: null })).toEqual([
            "cancel",
        ])
    })

    it("待寄回商品_给填物流入口；已填过再加一个查看，免得买家以为没填成功", () => {
        expect(buyerAfterSaleActions({ status: "RETURNING", returnTrackingNo: null })).toEqual([
            "return",
        ])
        expect(
            buyerAfterSaleActions({ status: "RETURNING", returnTrackingNo: "SF123456" }),
        ).toEqual(["return", "track"])
    })

    it.each(["REFUNDED", "REJECTED", "CLOSED"] as const)("终态_%s 不给任何操作", (status) => {
        expect(buyerAfterSaleActions({ status, returnTrackingNo: "SF123456" })).toEqual([])
    })
})

describe("canApplyAfterSale（申请入口的门槛）", () => {
    it("已完成且窗口未过且没申请过_可以申请", () => {
        expect(canApplyAfterSale(makeGate(), NOW)).toBe(true)
    })

    it("订单还在履约中_不能申请：售后窗口从确认收货才开", () => {
        expect(canApplyAfterSale(makeGate({ status: "pending_receipt" }), NOW)).toBe(false)
        expect(canApplyAfterSale(makeGate({ status: "cancelled" }), NOW)).toBe(false)
    })

    it("申请窗口已过_不能申请（窗口天数归后端，前端只比时刻）", () => {
        expect(canApplyAfterSale(makeGate({ applyExpireAt: "2026-01-01T00:00:00Z" }), NOW)).toBe(
            false,
        )
    })

    it("没有窗口截止时刻_不能申请：宁可少给入口，也不给一个必然 409 的按钮", () => {
        expect(canApplyAfterSale(makeGate({ applyExpireAt: null }), NOW)).toBe(false)
    })

    it.each(["APPLYING", "RETURNING"] as const)(
        "已有进行中的售后单_不能申请（%s）：同单不能并存第二张",
        (afterSaleStatus) => {
            expect(canApplyAfterSale(makeGate({ afterSaleStatus }), NOW)).toBe(false)
        },
    )

    it("已退款_仍不给入口：V1 后端未拦二次申请，前端不主动把用户送到重复退款那条路", () => {
        expect(canApplyAfterSale(makeGate({ afterSaleStatus: "REFUNDED" }), NOW)).toBe(false)
    })

    it.each(["REJECTED", "CLOSED"] as const)(
        "被拒或已撤销_窗口内可以重新申请（%s）",
        (afterSaleStatus) => {
            expect(canApplyAfterSale(makeGate({ afterSaleStatus }), NOW)).toBe(true)
        },
    )
})

describe("toAfterSaleTicket（wire 投影）", () => {
    it("可空字段如实透传 null，不给「未填写」造一个空串", () => {
        const ticket = toAfterSaleTicket({
            id: "t-1",
            orderId: "o-1",
            type: "RETURN_REFUND",
            status: "RETURNING",
            reason: null,
            refundAmount: null,
            returnLogisticsCompany: null,
            returnTrackingNo: null,
            refundedAt: null,
            createdAt: "2026-01-02T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
        })

        expect(ticket).toMatchObject({
            type: "RETURN_REFUND",
            status: "RETURNING",
            reason: null,
            refundAmount: null,
            returnTrackingNo: null,
        })
    })

    it("退款金额与回寄单原样带出（回寄后买家要能从卡上核对运单号）", () => {
        const ticket = toAfterSaleTicket({
            id: "t-2",
            orderId: "o-1",
            type: "RETURN_REFUND",
            status: "REFUNDED",
            reason: "尺码不合适",
            refundAmount: { amount: 19900, currency: "CNY" },
            returnLogisticsCompany: "顺丰速运",
            returnTrackingNo: "SF123456",
            refundedAt: "2026-01-06T00:00:00Z",
            createdAt: "2026-01-02T00:00:00Z",
            updatedAt: "2026-01-06T00:00:00Z",
        })

        expect(ticket.refundAmount).toEqual({ amount: 19900, currency: "CNY" })
        expect(ticket.returnLogisticsCompany).toBe("顺丰速运")
        expect(ticket.returnTrackingNo).toBe("SF123456")
    })
})

describe("展示辅助", () => {
    it("两类售后与两种进行中态都有买家看得懂的中文", () => {
        expect(AFTER_SALE_TYPE_LABEL.RETURN_REFUND).toBe("退货退款")
        expect(TICKET_STATUS_LABEL.APPLYING).toBe("待卖家处理")
        expect(TICKET_STATUS_LABEL.RETURNING).toBe("待寄回商品")
    })
})
