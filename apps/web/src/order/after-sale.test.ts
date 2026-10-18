import { describe, expect, it } from "vite-plus/test"

import {
    buyerAfterSaleActions,
    canApplyAfterSale,
    defaultRefundQuantities,
    maxRefundQuantity,
} from "./after-sale"
import type { ApplyGate } from "./after-sale"

function makeGate(overrides: Partial<ApplyGate> = {}): ApplyGate {
    return {
        status: "completed",
        afterSaleBadge: "none",
        applyExpireAt: "2026-01-10T00:00:00Z",
        ...overrides,
    }
}

const NOW = Date.parse("2026-01-05T00:00:00Z")

describe("buyerAfterSaleActions（买家此刻能做什么——消费后端下发的 availableActions）", () => {
    it("待处理_契约给撤销_就给撤销入口", () => {
        expect(
            buyerAfterSaleActions({ availableActions: ["CANCEL"], returnTrackingNo: null }),
        ).toEqual(["cancel"])
    })

    it("待寄回_撤销与回寄并存_已填过运单号再加一个查看（导航是前端的事，状态机不是）", () => {
        expect(
            buyerAfterSaleActions({
                availableActions: ["CANCEL", "RETURN_GOODS"],
                returnTrackingNo: null,
            }),
        ).toEqual(["cancel", "return"])
        expect(
            buyerAfterSaleActions({
                availableActions: ["RETURN_GOODS"],
                returnTrackingNo: "SF123456",
            }),
        ).toEqual(["return", "track"])
    })

    it("终态且窗口内_契约下发重新申请_卡片给入口（行级退款：部分退完还能再申请）", () => {
        expect(
            buyerAfterSaleActions({ availableActions: ["REAPPLY"], returnTrackingNo: null }),
        ).toEqual(["reapply"])
    })

    it("进行中_契约只下发撤销或回寄_不会出现重新申请", () => {
        expect(
            buyerAfterSaleActions({ availableActions: ["CANCEL"], returnTrackingNo: "SF123456" }),
        ).toEqual(["cancel"])
    })
})

describe("canApplyAfterSale（申请入口的门槛）", () => {
    it("已完成且窗口未过且无未完结退款_可以申请", () => {
        expect(canApplyAfterSale(makeGate(), NOW)).toBe(true)
    })

    it("待收货_给入口：包裹在路上/已签收未确认，买家不必等确认收货才能讲理", () => {
        expect(canApplyAfterSale(makeGate({ status: "pending_receipt" }), NOW)).toBe(true)
        expect(
            canApplyAfterSale(makeGate({ status: "pending_receipt", applyExpireAt: null }), NOW),
        ).toBe(true)
    })

    it("待发货与已取消_不能申请：待发货的出口是取消退款，不必再开一条退款通道", () => {
        expect(canApplyAfterSale(makeGate({ status: "pending_shipment" }), NOW)).toBe(false)
        expect(canApplyAfterSale(makeGate({ status: "cancelled" }), NOW)).toBe(false)
    })

    it("申请窗口已过或没有截止时刻_不能申请（窗口天数归后端，前端只比时刻）", () => {
        expect(canApplyAfterSale(makeGate({ applyExpireAt: "2026-01-01T00:00:00Z" }), NOW)).toBe(
            false,
        )
        expect(canApplyAfterSale(makeGate({ applyExpireAt: null }), NOW)).toBe(false)
    })

    it("有未完结退款（角标退款中）_不能申请：同一订单行至多一张未完结退款单", () => {
        expect(canApplyAfterSale(makeGate({ afterSaleBadge: "refunding" }), NOW)).toBe(false)
    })

    it("已退过款_不挡再申请：退款是行级的，退掉部分商品后剩下的仍可退", () => {
        expect(canApplyAfterSale(makeGate({ afterSaleBadge: "refunded" }), NOW)).toBe(true)
        expect(canApplyAfterSale(makeGate({ afterSaleBadge: "compensated" }), NOW)).toBe(true)
    })
})

describe("maxRefundQuantity（两种退款的额度口径与后端 §8 一致）", () => {
    it("只退未发件：仅退款 = 买 − 已发 − 已退，退货退款 = 当前有效发货量", () => {
        const item = { quantity: 5, shippedQuantity: 3, refundedQuantity: 1 }
        expect(maxRefundQuantity(item, "REFUND_ONLY")).toBe(1)
        expect(maxRefundQuantity(item, "RETURN_REFUND")).toBe(3)
    })

    it("全部发出_仅退款额度为零：货已发出只能走退货退款", () => {
        const item = { quantity: 2, shippedQuantity: 2, refundedQuantity: 0 }
        expect(maxRefundQuantity(item, "REFUND_ONLY")).toBe(0)
        expect(maxRefundQuantity(item, "RETURN_REFUND")).toBe(2)
    })

    it("默认数量只含有额度的行，且等于该行上限", () => {
        expect(
            defaultRefundQuantities(
                [
                    { orderItemId: "a", quantity: 2, shippedQuantity: 2, refundedQuantity: 0 },
                    { orderItemId: "b", quantity: 1, shippedQuantity: 0, refundedQuantity: 1 },
                ],
                "RETURN_REFUND",
            ),
        ).toEqual({ a: 2 })
    })
})
