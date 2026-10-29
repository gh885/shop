import { describe, expect, it } from "vite-plus/test"

import type { CaseView } from "@shop/api/sdk"

import {
    buyerAfterSaleActions,
    canApplyAfterSale,
    defaultRefundQuantities,
    maxRefundQuantity,
    needsGoodsBack,
} from "./after-sale"

const baseCase: CaseView = {
    id: "case-1",
    caseNo: "RMA20260101001",
    sellerOrderId: "seller-1",
    buyerId: "buyer-1",
    merchantId: "merchant-1",
    type: "RETURN_REFUND",
    status: "APPLIED",
    reasonCode: "QUALITY",
    responsibility: "BUYER",
    refundAmount: 0,
    shippingRefundAmount: 0,
    currency: "CNY",
    deadlineAt: "2026-01-10T00:00:00Z",
    deadlineActor: "BUYER",
    deadlineAction: "SHIP_BACK",
    createdAt: "2026-01-01T00:00:00Z",
    items: [],
}

function makeCase(overrides: Partial<Pick<CaseView, "status" | "type">> = {}): CaseView {
    return { ...baseCase, ...overrides }
}

describe("buyerAfterSaleActions（状态驱动买家此刻能做什么）", () => {
    it("申请中：给撤销入口", () => {
        expect(buyerAfterSaleActions(makeCase({ status: "APPLIED" }))).toEqual(["cancel"])
    })

    it("已同意且要寄回：给回寄入口；仅退款类型不需要寄回", () => {
        expect(
            buyerAfterSaleActions(makeCase({ status: "APPROVED", type: "RETURN_REFUND" })),
        ).toEqual(["return"])
        expect(
            buyerAfterSaleActions(makeCase({ status: "APPROVED", type: "REFUND_ONLY" })),
        ).toEqual([])
    })

    it("被拒：给重新申请入口", () => {
        expect(buyerAfterSaleActions(makeCase({ status: "REJECTED" }))).toEqual(["reapply"])
    })

    it("终态不再出现买家动作", () => {
        expect(buyerAfterSaleActions(makeCase({ status: "COMPLETED" }))).toEqual([])
        expect(buyerAfterSaleActions(makeCase({ status: "CANCELLED" }))).toEqual([])
    })
})

describe("needsGoodsBack", () => {
    it("仅退款不用寄回，退货退款与换货要寄回", () => {
        expect(needsGoodsBack("REFUND_ONLY")).toBe(false)
        expect(needsGoodsBack("RETURN_REFUND")).toBe(true)
        expect(needsGoodsBack("EXCHANGE")).toBe(true)
    })
})

describe("canApplyAfterSale（申请入口的门槛）", () => {
    it("已付款与部分退款中的订单可以申请", () => {
        expect(canApplyAfterSale({ status: "paid" })).toBe(true)
        expect(canApplyAfterSale({ status: "partially_refunded" })).toBe(true)
    })

    it("待付款、已取消、已关闭、已退款完成都不能申请", () => {
        for (const status of ["pending_payment", "cancelled", "closed", "refunded"] as const) {
            expect(canApplyAfterSale({ status })).toBe(false)
        }
    })
})

describe("maxRefundQuantity（两种退款的额度口径）", () => {
    it("仅退款退没发出去的货（买 − 已发），退货退款退已发出的货", () => {
        const item = { quantity: 5, shippedQuantity: 3 }
        expect(maxRefundQuantity(item, "REFUND_ONLY")).toBe(2)
        expect(maxRefundQuantity(item, "RETURN_REFUND")).toBe(3)
    })

    it("全部发出：仅退款额度为零，货已发出只能走退货退款", () => {
        const item = { quantity: 2, shippedQuantity: 2 }
        expect(maxRefundQuantity(item, "REFUND_ONLY")).toBe(0)
        expect(maxRefundQuantity(item, "RETURN_REFUND")).toBe(2)
    })

    it("额度不为负：发货量超过购买量时收敛到 0", () => {
        expect(maxRefundQuantity({ quantity: 1, shippedQuantity: 4 }, "REFUND_ONLY")).toBe(0)
    })
})

describe("defaultRefundQuantities", () => {
    it("默认数量只含有额度的行，且等于该行上限；key 是行号", () => {
        expect(
            defaultRefundQuantities(
                [
                    { lineNo: 1, quantity: 2, shippedQuantity: 2 },
                    { lineNo: 2, quantity: 1, shippedQuantity: 0 },
                ],
                "RETURN_REFUND",
            ),
        ).toEqual({ 1: 2 })
    })

    it("仅退款口径下已发出的行额度为零，不进默认表", () => {
        expect(
            defaultRefundQuantities(
                [
                    { lineNo: 1, quantity: 2, shippedQuantity: 2 },
                    { lineNo: 2, quantity: 1, shippedQuantity: 0 },
                ],
                "REFUND_ONLY",
            ),
        ).toEqual({ 2: 1 })
    })
})
