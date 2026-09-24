import { describe, expect, it } from "vitest"

import { compactCount } from "./count"

describe("compactCount", () => {
    it("小于 1 万原样：千位不折位（「1.2千」和「1200」在同一条卡片上会打架）", () => {
        expect(compactCount(0)).toBe("0")
        expect(compactCount(999)).toBe("999")
        expect(compactCount(1200)).toBe("1200")
        expect(compactCount(9999)).toBe("9999")
    })

    it("1 万以上折成「x.x万」，整数万去尾", () => {
        expect(compactCount(10000)).toBe("1万")
        expect(compactCount(12000)).toBe("1.2万")
        expect(compactCount(123456)).toBe("12.3万")
    })

    it("四舍五入由 toFixed 定，不自己截断", () => {
        expect(compactCount(19999)).toBe("2万")
    })
})
