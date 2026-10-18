import { describe, expect, it } from "vite-plus/test"

import type { CouponRule } from "@shop/common/domain"

import { couponRuleFact, couponRuleText } from "./coupon-rule"

/**
 * 券规则 → 事实：只选对 key、把数字塞进 params，句子留给各端 catalog（§4.1）。
 * 这里断言的是「路由」本身：组合漏一条、封顶漏塞、折扣数选错档，都会当场红。
 */
const rate = { tenths: "9", percent: "10" } as const

describe("couponRuleFact 路由", () => {
    it.each([
        [
            "满减·有门槛",
            { kind: "reduction", threshold: "¥100", discount: "¥10" } as CouponRule,
            "coupon.rule.reduction.threshold",
            { threshold: "¥100", discount: "¥10" },
        ],
        [
            "满减·无门槛（0 门槛不是「满 ¥0」）",
            { kind: "reduction", discount: "¥10" } as CouponRule,
            "coupon.rule.reduction.noThreshold",
            { discount: "¥10" },
        ],
        [
            "折扣·有门槛·无封顶",
            { kind: "rate", threshold: "¥100", rate } as CouponRule,
            "coupon.rule.rate.threshold",
            { threshold: "¥100", rate: "9" },
        ],
        [
            "折扣·有门槛·封顶必进 params（CPN-65）",
            { kind: "rate", threshold: "¥100", rate, cap: "¥50" } as CouponRule,
            "coupon.rule.rate.thresholdCapped",
            { threshold: "¥100", rate: "9", cap: "¥50" },
        ],
        [
            "折扣·无门槛·无封顶",
            { kind: "rate", rate } as CouponRule,
            "coupon.rule.rate.noThreshold",
            { rate: "9" },
        ],
        [
            "折扣·无门槛·封顶",
            { kind: "rate", rate, cap: "¥30" } as CouponRule,
            "coupon.rule.rate.noThresholdCapped",
            { rate: "9", cap: "¥30" },
        ],
    ])("%s", (_label, rule, message, params) => {
        expect(couponRuleFact(rule, "zh-Hans-CN")).toEqual({ message, params })
    })

    it("折扣数按语言选档：中文十分位（9），英文百分比（10）", () => {
        const rule = { kind: "rate", threshold: "¥100", rate } as CouponRule
        expect(couponRuleFact(rule, "zh-Hans-CN")).toEqual({
            message: "coupon.rule.rate.threshold",
            params: { threshold: "¥100", rate: "9" },
        })
        expect(couponRuleFact(rule, "en-US")).toEqual({
            message: "coupon.rule.rate.threshold",
            params: { threshold: "¥100", rate: "10" },
        })
    })

    it("只产 key+params，不拼句子：message 恒是 catalog key", () => {
        const fact = couponRuleFact({ kind: "reduction", discount: "¥10" }, "zh-Hans-CN")
        expect(fact.message).toMatch(/^coupon\.rule\./)
    })
})

describe("couponRuleText 句子出口", () => {
    it("fact 经 app-kit catalog 出句子：插值、折扣档、封顶都落对", () => {
        expect(
            couponRuleText({ kind: "reduction", threshold: "¥100", discount: "¥10" }, "zh-Hans-CN"),
        ).toBe("满 ¥100 减 ¥10")
        expect(
            couponRuleText({ kind: "rate", threshold: "¥100", rate, cap: "¥50" }, "zh-Hans-CN"),
        ).toBe("满 ¥100 打 9 折，最高减 ¥50")
        expect(couponRuleText({ kind: "rate", threshold: "¥100", rate }, "en-US")).toBe(
            "10% off when you spend ¥100",
        )
    })
})
