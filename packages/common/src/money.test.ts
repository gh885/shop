import { describe, expect, it } from "vitest"

import { fenToYuan, priceRangeText, splitFen, yuanToFen } from "./money"

/** 金额工具测试：后端一律「分」，前端展示/输入一律「元」——换算是唯一真相源，必须钉死 */
describe("fenToYuan", () => {
    it("分 → 两位小数元字符串", () => {
        expect(fenToYuan(29900)).toBe("299.00")
        expect(fenToYuan(0)).toBe("0.00")
        expect(fenToYuan(5)).toBe("0.05")
        expect(fenToYuan(1005)).toBe("10.05")
    })

    it("undefined 显示占位符（可自定义）", () => {
        expect(fenToYuan(undefined)).toBe("—")
        expect(fenToYuan(undefined, "面议")).toBe("面议")
    })
})

describe("splitFen", () => {
    it("拆成元整数 + 两位角分（分段排版用）", () => {
        expect(splitFen(1234)).toEqual({ yuan: "12", cents: "34" })
        expect(splitFen(5)).toEqual({ yuan: "0", cents: "05" })
        expect(splitFen(1200)).toEqual({ yuan: "12", cents: "00" })
    })
})

describe("yuanToFen", () => {
    it("元输入 → 分（四舍五入到分）", () => {
        expect(yuanToFen("12.34")).toBe(1234)
        expect(yuanToFen("0.1")).toBe(10)
        expect(yuanToFen("10")).toBe(1000)
    })

    it("非法输入返回 undefined（空串/非数字/负数），由调用方拦截", () => {
        expect(yuanToFen("")).toBeUndefined()
        expect(yuanToFen("  ")).toBeUndefined()
        expect(yuanToFen("abc")).toBeUndefined()
        expect(yuanToFen("-5")).toBeUndefined()
    })
})

describe("priceRangeText", () => {
    it("未定价占位", () => {
        expect(priceRangeText(undefined)).toBe("未定价")
    })

    it("单规格同价只显示一个价", () => {
        expect(priceRangeText(100)).toBe("¥1.00")
        expect(priceRangeText(100, 100)).toBe("¥1.00")
    })

    it("区间展示两端", () => {
        expect(priceRangeText(100, 250)).toBe("¥1.00 ~ ¥2.50")
    })
})
