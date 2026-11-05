import { describe, expect, it } from "vite-plus/test"

import {
    defaultShipQuantities,
    remainingQuantity,
    shipLinesFromQuantities,
    type ShipLineSource,
} from "./ship-form"

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
