import { describe, expect, it } from "vite-plus/test"

import { couponFaceValue, couponRate, couponReductionRule, couponRule } from "./coupon"
import { money } from "./money"

/** 券的事实层测试：只把契约数字/码值变成形状（缺的标 undefined），不产出句子；句子在各端 catalog（§4.1），拼对没有由 web coupon-rule.test.ts 那侧管 */
describe("couponRate", () => {
    it("十分位与百分比同时给：0.9 是「九折」也是「减 10%」", () => {
        expect(couponRate(0.9)).toEqual({ tenths: "9", percent: "10" })
        expect(couponRate(0.95)).toEqual({ tenths: "9.5", percent: "5" })
    })

    it("去尾：整数十分位不带 .0（0.8 → 8 而不是 8.0）", () => {
        expect(couponRate(0.8)).toEqual({ tenths: "8", percent: "20" })
    })
})

describe("couponReductionRule", () => {
    it("门槛 0 是无门槛（threshold 为 undefined），不是「满 ¥0」", () => {
        expect(couponReductionRule(money(0), money(1000), "zh-Hans-CN")).toEqual({
            kind: "reduction",
            threshold: undefined,
            discount: "¥10",
        })
    })

    it("有门槛：门槛与面额都在 fact 里（金额已是 Intl 格式化好的文本）", () => {
        expect(couponReductionRule(money(10000), money(1000), "zh-Hans-CN")).toEqual({
            kind: "reduction",
            threshold: "¥100",
            discount: "¥10",
        })
    })

    it("符号跟币种走，不写死 ¥", () => {
        expect(couponReductionRule(money(10000, "USD"), money(1000, "USD"), "en-US")).toEqual({
            kind: "reduction",
            threshold: "$100",
            discount: "$10",
        })
    })
})

describe("couponRule", () => {
    it("满减型走 reduction 分支", () => {
        expect(
            couponRule(
                money(10000),
                { type: "FULL_REDUCTION", discount: money(1000) },
                "zh-Hans-CN",
            ),
        ).toEqual({ kind: "reduction", threshold: "¥100", discount: "¥10" })
    })

    it("折扣型走 rate 分支，带封顶", () => {
        expect(
            couponRule(
                money(10000),
                { type: "DISCOUNT", discountRate: 0.9, maxDiscount: money(5000) },
                "zh-Hans-CN",
            ),
        ).toEqual({
            kind: "rate",
            threshold: "¥100",
            rate: { tenths: "9", percent: "10" },
            cap: "¥50",
        })
    })

    it("折扣型无封顶：cap 是 undefined（不是空串，调用点要能分辨「没封顶」）", () => {
        expect(couponRule(money(0), { type: "DISCOUNT", discountRate: 0.8 }, "zh-Hans-CN")).toEqual(
            {
                kind: "rate",
                threshold: undefined,
                rate: { tenths: "8", percent: "20" },
                cap: undefined,
            },
        )
    })
})

describe("couponFaceValue", () => {
    it("满减型给金额", () => {
        expect(
            couponFaceValue({ type: "FULL_REDUCTION", discount: money(1000) }, "zh-Hans-CN"),
        ).toEqual({ kind: "money", text: "¥10" })
    })

    it("折扣型给折扣率的两种表示", () => {
        expect(couponFaceValue({ type: "DISCOUNT", discountRate: 0.9 }, "zh-Hans-CN")).toEqual({
            kind: "rate",
            rate: { tenths: "9", percent: "10" },
        })
    })

    it("两者皆无：给 undefined（占位符由调用点出，common 不给「—」那句）", () => {
        expect(couponFaceValue({ type: "FULL_REDUCTION" }, "zh-Hans-CN")).toBeUndefined()
    })
})
