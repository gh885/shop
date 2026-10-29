import { describe, expect, it } from "vite-plus/test"

import { VALIDATION_RULES } from "@shop/common/contract"
import { TRACKING_NO_MAX } from "@shop/common/domain"

import {
    defaultShipQuantities,
    remainingQuantity,
    ShipSchema,
    shipInputFromForm,
    shipLinesFromQuantities,
    type ShipLineSource,
} from "./ship-form"

function issues(values: unknown): string[] {
    return ShipSchema.safeParse(values).error?.issues.map((issue) => issue.message) ?? []
}

describe("ShipSchema", () => {
    it("没选承运商：给的是 catalog 那条「必填」事实，不是 zod 默认的英文句", () => {
        expect(issues({ carrierCode: "", trackingNo: "SF123456" })).toContain(
            VALIDATION_RULES.REQUIRED,
        )
    })

    it("运单号空着 / 只有空格都不放行（空格在 trim 之后就是空）", () => {
        expect(issues({ carrierCode: "sf", trackingNo: "" }).length).toBeGreaterThan(0)
        expect(ShipSchema.safeParse({ carrierCode: "sf", trackingNo: "   " }).success).toBe(false)
    })

    it("运单号超出上限被拒，上限就是 @shop/common 那一个数", () => {
        expect(
            ShipSchema.safeParse({ carrierCode: "sf", trackingNo: "1".repeat(TRACKING_NO_MAX) })
                .success,
        ).toBe(true)
        expect(
            ShipSchema.safeParse({
                carrierCode: "sf",
                trackingNo: "1".repeat(TRACKING_NO_MAX + 1),
            }).success,
        ).toBe(false)
    })

    it("校验通过就顺手清掉首尾空格：交出来的 data 已经是能拿去精确匹配的形状", () => {
        const parsed = ShipSchema.safeParse({ carrierCode: "sf", trackingNo: " SF123456 " })

        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.trackingNo).toBe("SF123456")
    })
})

describe("shipInputFromForm", () => {
    it("提交体 = code + 运单号 + 按行发量，运单号不带空格", () => {
        expect(
            shipInputFromForm({ carrierCode: "sf", trackingNo: "SF123456 " }, [
                { lineNo: 1, quantity: 2 },
            ]),
        ).toEqual({
            carrierCode: "sf",
            trackingNo: "SF123456",
            items: [{ lineNo: 1, quantity: 2 }],
        })
    })
})

function line(
    lineNo: number,
    quantity: number,
    shippedQty: number,
    refundedQty = 0,
): ShipLineSource {
    return {
        lineNo,
        quantity,
        shippedQty,
        refundedQty,
        remaining: quantity - shippedQty - refundedQty,
    }
}

describe("按行发量", () => {
    it("剩余可发 = 买 − 已发 − 已退：退回的货不回可发池", () => {
        expect(remainingQuantity(line(1, 5, 2))).toBe(3)
        expect(remainingQuantity(line(1, 5, 2, 1))).toBe(2)
        expect(remainingQuantity(line(1, 1, 1))).toBe(0)
    })

    it("已退超过可发量也压到 0：不交出负数量", () => {
        expect(remainingQuantity(line(1, 1, 0, 2))).toBe(0)
    })

    it("默认发完剩余量；已结清的行不发（0 不占行）", () => {
        const partial = line(1, 3, 1)
        const done = line(2, 2, 2)
        const items = [partial, done]

        expect(defaultShipQuantities(items)).toEqual({ 1: 2, 2: 0 })
        expect(shipLinesFromQuantities(items, defaultShipQuantities(items))).toEqual([
            { lineNo: 1, quantity: 2 },
        ])
    })

    it("填大了按剩余量截断：前端先算对，别等后端 409", () => {
        const single = line(1, 3, 1)
        expect(shipLinesFromQuantities([single], { 1: 99 })).toEqual([{ lineNo: 1, quantity: 2 }])
    })
})
