import { describe, expect, it } from "vite-plus/test"

import { buyerAfterSaleActions, canApplyAfterSale } from "./after-sale"
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

describe("buyerAfterSaleActions（买家此刻能做什么——消费后端下发的 availableActions）", () => {
    it("待卖家处理_契约给撤销_就给撤销入口", () => {
        expect(
            buyerAfterSaleActions({ availableActions: ["CANCEL"], returnTrackingNo: null }),
        ).toEqual(["cancel"])
    })

    it("待寄回商品_契约给回寄_已填过运单号再加一个查看（导航是前端的事，状态机不是）", () => {
        expect(
            buyerAfterSaleActions({ availableActions: ["RETURN_GOODS"], returnTrackingNo: null }),
        ).toEqual(["return"])
        expect(
            buyerAfterSaleActions({
                availableActions: ["RETURN_GOODS"],
                returnTrackingNo: "SF123456",
            }),
        ).toEqual(["return", "track"])
    })

    it("被拒/已撤销且在窗口内_契约下发重新申请_卡片给入口（AFS-04）", () => {
        expect(
            buyerAfterSaleActions({ availableActions: ["REAPPLY"], returnTrackingNo: null }),
        ).toEqual(["reapply"])
    })

    it("已退款终态_契约什么都不下发_不给任何操作（二次退款敞口由后端封死）", () => {
        expect(
            buyerAfterSaleActions({ availableActions: [], returnTrackingNo: "SF123456" }),
        ).toEqual([])
    })
})

describe("canApplyAfterSale（申请入口的门槛）", () => {
    it("已完成且窗口未过且没申请过_可以申请", () => {
        expect(canApplyAfterSale(makeGate(), NOW)).toBe(true)
    })

    it("待收货_给入口：包裹在路上/已签收未确认，买家不必等确认收货才能讲理", () => {
        expect(canApplyAfterSale(makeGate({ status: "pending_receipt" }), NOW)).toBe(true)
        // 待收货阶段申请截止列还没回填，缺列也算窗口开着
        expect(
            canApplyAfterSale(makeGate({ status: "pending_receipt", applyExpireAt: null }), NOW),
        ).toBe(true)
    })

    it("待发货与已取消_不能申请：待发货的出口是取消退款，不必再开一条退款通道", () => {
        expect(canApplyAfterSale(makeGate({ status: "pending_shipment" }), NOW)).toBe(false)
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

    it("已退款_不给入口：后端已挡二次申请（AFTER_SALE_ALREADY_REFUNDED），前端同样不引导", () => {
        expect(canApplyAfterSale(makeGate({ afterSaleStatus: "REFUNDED" }), NOW)).toBe(false)
    })

    it.each(["REJECTED", "CLOSED"] as const)(
        "被拒或已撤销_窗口内可以重新申请（%s）",
        (afterSaleStatus) => {
            expect(canApplyAfterSale(makeGate({ afterSaleStatus }), NOW)).toBe(true)
        },
    )
})
