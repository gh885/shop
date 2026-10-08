import { describe, expect, it } from "vite-plus/test"

import { compactCount } from "./count"

describe("compactCount", () => {
    it("小于 1 万原样：千位不折位（「1.2千」和「1200」在同一条卡片上会打架）", () => {
        expect(compactCount(0, "zh-Hans-CN")).toBe("0")
        expect(compactCount(999, "zh-Hans-CN")).toBe("999")
        expect(compactCount(1200, "zh-Hans-CN")).toBe("1200")
        expect(compactCount(9999, "zh-Hans-CN")).toBe("9999")
    })

    it("1 万以上折成「x.x万」，整数万去尾（PRD-68 的口径，locale 必填）", () => {
        expect(compactCount(10000, "zh-Hans-CN")).toBe("1万")
        expect(compactCount(12000, "zh-Hans-CN")).toBe("1.2万")
        expect(compactCount(123456, "zh-Hans-CN")).toBe("12.3万")
    })

    it("一位小数（不是 Intl 默认的「按量级自适应」——那会把 12.3万 印成 12万）", () => {
        expect(compactCount(1234567, "zh-Hans-CN")).toBe("123.5万")
    })

    it("英文界面出 K，不出「万」：折位单位由语言决定（这就是交给 Intl 而不是拼单字的理由）", () => {
        expect(compactCount(12000, "en-US")).toBe("12K")
        expect(compactCount(123456, "en-US")).toBe("123.5K")
    })

    it("四舍五入由 compact 规则定，不自己截断", () => {
        expect(compactCount(19999, "zh-Hans-CN")).toBe("2万")
    })

    it("异常数值不把NaN 或负数渲染到卡片上；小数先截断（计数是整数域）", () => {
        expect(compactCount(Number.NaN, "zh-Hans-CN")).toBe("0")
        expect(compactCount(Number.POSITIVE_INFINITY, "zh-Hans-CN")).toBe("0")
        expect(compactCount(-1, "zh-Hans-CN")).toBe("0")
        expect(compactCount(12.9, "zh-Hans-CN")).toBe("12")
    })
})
