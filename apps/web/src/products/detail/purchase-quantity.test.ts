import { describe, expect, it } from "vite-plus/test"

import { PDP_MAX_QUANTITY } from "./constants"
import {
    clampPurchaseQuantity,
    quantityUpperBound,
    QUANTITY_FLOOR,
    stepPurchaseQuantity,
} from "./purchase-quantity"

/**
 * 展示值与提交值同源是这组规则唯一的目的，所以断言打在「同一个库存进来，
 * 上界、收敛、步进三个函数说的是同一件事」上，而不是各算各的数。
 */
describe("quantityUpperBound", () => {
    it("库存是上界_选中规格的库存多少，数量最多填多少", () => {
        expect(quantityUpperBound(7)).toBe(7)
    })

    it("没选全规格（库存未知）_退回展示上限", () => {
        expect(quantityUpperBound(undefined)).toBe(PDP_MAX_QUANTITY)
        expect(quantityUpperBound(null)).toBe(PDP_MAX_QUANTITY)
    })

    it("售罄的 0 不会变成上界_收到下界 1，数量框不替按钮表达「售罄」", () => {
        expect(quantityUpperBound(0)).toBe(QUANTITY_FLOOR)
    })

    it("展示上界严于服务端闸门 999_PRD-72 与 ORD-03 是两个数，对齐了就没人管恶拍（Java 侧同一条不等式也钉着）", () => {
        expect(PDP_MAX_QUANTITY).toBeLessThan(999)
    })
})

describe("clampPurchaseQuantity", () => {
    it("规格切到库存更少的 SKU_原数量被压到新上界，而不是留着超卖数", () => {
        expect(clampPurchaseQuantity(5, 2)).toBe(2)
    })

    it("数量本来就没超_原样返回，不刻意往下压", () => {
        expect(clampPurchaseQuantity(2, 5)).toBe(2)
    })

    it("库存未知_已选数量照常保留", () => {
        expect(clampPurchaseQuantity(3, undefined)).toBe(3)
    })

    it("收敛只往下压_不替调用方把数量抬起来，下界由上界函数与步进器各自守住", () => {
        expect(clampPurchaseQuantity(0, 5)).toBe(0)
        expect(clampPurchaseQuantity(1, 0)).toBe(QUANTITY_FLOOR)
    })
})

describe("stepPurchaseQuantity", () => {
    it("加一档不越过库存_到顶就停", () => {
        expect(stepPurchaseQuantity(4, 1, 5)).toBe(5)
        expect(stepPurchaseQuantity(5, 1, 5)).toBe(5)
    })

    it("减一档不越过 1_到底就停", () => {
        expect(stepPurchaseQuantity(2, -1, 5)).toBe(1)
        expect(stepPurchaseQuantity(1, -1, 5)).toBe(1)
    })

    it("售罄时加减都停在 1_按钮的 disabled 与这里算的是同一个边界", () => {
        expect(stepPurchaseQuantity(1, 1, 0)).toBe(QUANTITY_FLOOR)
        expect(stepPurchaseQuantity(1, -1, 0)).toBe(QUANTITY_FLOOR)
    })

    it("未选全规格_加到展示上限为止", () => {
        expect(stepPurchaseQuantity(PDP_MAX_QUANTITY, 1, undefined)).toBe(PDP_MAX_QUANTITY)
    })
})
