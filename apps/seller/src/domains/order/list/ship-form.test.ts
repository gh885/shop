import { describe, expect, it } from "vite-plus/test"

import type { CarrierResponse } from "@shop/api/sdk"

import { VALIDATION_RULES } from "@shop/common/contract"
import { TRACKING_NO_MAX } from "@shop/common/domain"
import {
    carrierSelectItems,
    defaultShipQuantities,
    remainingQuantity,
    ShipSchema,
    shipInputFromForm,
    shipLinesFromQuantities,
} from "./ship-form"
// 承运商从自由文本升级成字典下拉：退回去不报错，只是又落进五种写法的「顺丰」，必须一行测试挡着

const CARRIERS: CarrierResponse[] = [
    { code: "SF", name: "顺丰速运" },
    { code: "ZTO", name: "中通快递" },
]

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
        expect(issues({ carrierCode: "SF", trackingNo: "" }).length).toBeGreaterThan(0)
        expect(ShipSchema.safeParse({ carrierCode: "SF", trackingNo: "   " }).success).toBe(false)
    })

    it("运单号超出上限被拒，上限就是 @shop/common 那一个数", () => {
        expect(
            ShipSchema.safeParse({ carrierCode: "SF", trackingNo: "1".repeat(TRACKING_NO_MAX) })
                .success,
        ).toBe(true)
        expect(
            ShipSchema.safeParse({
                carrierCode: "SF",
                trackingNo: "1".repeat(TRACKING_NO_MAX + 1),
            }).success,
        ).toBe(false)
    })

    it("校验通过就顺手清掉首尾空格：交出来的 data 已经是能拿去精确匹配的形状", () => {
        const parsed = ShipSchema.safeParse({ carrierCode: "SF", trackingNo: " SF123456 " })

        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.trackingNo).toBe("SF123456")
    })
})

describe("shipInputFromForm", () => {
    it("提交体 = code + 运单号 + 按行发量，运单号不带空格", () => {
        expect(
            shipInputFromForm({ carrierCode: "SF", trackingNo: "SF123456 " }, [
                { orderItemId: "i-1", quantity: 2 },
            ]),
        ).toEqual({
            carrierCode: "SF",
            trackingNo: "SF123456",
            lines: [{ orderItemId: "i-1", quantity: 2 }],
        })
    })
})

describe("按行发量", () => {
    const item = (quantity: number, shippedQuantity: number, refundedQuantity = 0) => ({
        orderItemId: `i-${quantity}-${shippedQuantity}-${refundedQuantity}`,
        quantity,
        shippedQuantity,
        refundedQuantity,
    })

    it("剩余可发 = 买 − 已发 − 已退：退回的货不回可发池", () => {
        expect(remainingQuantity(item(5, 2))).toBe(3)
        expect(remainingQuantity(item(5, 2, 1))).toBe(2)
        expect(remainingQuantity(item(1, 1))).toBe(0)
    })

    it("默认发完剩余量；已结清的行不发（0 不占行）", () => {
        const partial = item(3, 1)
        const done = { ...item(2, 2), orderItemId: "i-done" }
        const items = [partial, done]
        expect(defaultShipQuantities(items)).toEqual({ [partial.orderItemId]: 2, "i-done": 0 })
        expect(shipLinesFromQuantities(items, defaultShipQuantities(items))).toEqual([
            { orderItemId: partial.orderItemId, quantity: 2 },
        ])
    })

    it("填大了按剩余量截断：前端先算对，别等后端 409", () => {
        const line = item(3, 1)
        expect(shipLinesFromQuantities([line], { [line.orderItemId]: 99 })).toEqual([
            { orderItemId: line.orderItemId, quantity: 2 },
        ])
    })
})

describe("carrierSelectItems", () => {
    it("下拉的 value 是字典 code、label 才是展示名：填反了就把展示名写进了库", () => {
        expect(carrierSelectItems(CARRIERS)).toEqual([
            { value: "SF", label: "顺丰速运" },
            { value: "ZTO", label: "中通快递" },
        ])
    })

    it("字典为空时交出空数组，不造一项占位", () => {
        expect(carrierSelectItems([])).toEqual([])
    })
})
