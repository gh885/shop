import { describe, expect, it } from "vite-plus/test"
import { renderHook } from "@testing-library/react"

import { couponMoneyText, money } from "@shop/common/domain"
import { I18nProvider } from "@shop/app-kit/i18n"
import { createAppI18n } from "@shop/app-kit/i18n"

import { couponFaceText, couponRuleText } from "./coupon-rule"
import { webMessages } from "#/locales"
import { useT } from "#/locales/use-t"
import type { AppLocale } from "@shop/i18n"
import type { ReactNode } from "react"

function renderT(locale: AppLocale) {
    const i18n = createAppI18n(locale, webMessages)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <I18nProvider i18n={i18n}>{children}</I18nProvider>
    )
    const { result } = renderHook(() => useT(), { wrapper })
    return result.current
}

describe("couponRuleText", () => {
    it("满减型：有门槛 / 无门槛两句分开（0 门槛不是「满 ¥0」）", () => {
        const t = renderT("zh-Hans-CN")
        expect(
            couponRuleText(
                { kind: "reduction", threshold: "¥100", discount: "¥10" },
                "zh-Hans-CN",
                t,
            ),
        ).toBe("满 ¥100 减 ¥10")
        expect(
            couponRuleText(
                { kind: "reduction", threshold: undefined, discount: "¥10" },
                "zh-Hans-CN",
                t,
            ),
        ).toBe("无门槛减 ¥10")
    })

    it("折扣型：中文用十分位（打 9 折），英文用百分比（10% off）", () => {
        const rule = {
            kind: "rate",
            threshold: "¥100",
            rate: { tenths: "9", percent: "10" },
        } as const
        expect(couponRuleText(rule, "zh-Hans-CN", renderT("zh-Hans-CN"))).toBe("满 ¥100 打 9 折")
        expect(couponRuleText(rule, "en-US", renderT("en-US"))).toBe("10% off when you spend ¥100")
    })

    it("封顶必进句子（CPN-65）：不写封顶的折扣券在用户眼里就是无限折扣", () => {
        const capped = {
            kind: "rate",
            threshold: "¥100",
            rate: { tenths: "9", percent: "10" },
            cap: "¥50",
        } as const
        expect(couponRuleText(capped, "zh-Hans-CN", renderT("zh-Hans-CN"))).toBe(
            "满 ¥100 打 9 折，最高减 ¥50",
        )
        expect(couponRuleText(capped, "en-US", renderT("en-US"))).toBe(
            "10% off when you spend ¥100, up to ¥50 off",
        )
    })

    it("无门槛 + 封顶：第三种组合别漏（模板少一条就是那一句回落成 key）", () => {
        expect(
            couponRuleText(
                {
                    kind: "rate",
                    threshold: undefined,
                    rate: { tenths: "8", percent: "20" },
                    cap: "¥30",
                },
                "zh-Hans-CN",
                renderT("zh-Hans-CN"),
            ),
        ).toBe("无门槛打 8 折，最高减 ¥30")
    })
})

describe("couponFaceText", () => {
    it("满减型给金额，折扣型给折扣率（中文十分位 / 英文百分比）", () => {
        expect(
            couponFaceText({ kind: "money", text: "¥10" }, "zh-Hans-CN", renderT("zh-Hans-CN")),
        ).toBe("¥10")
        const rate = { kind: "rate", rate: { tenths: "9", percent: "10" } } as const
        expect(couponFaceText(rate, "zh-Hans-CN", renderT("zh-Hans-CN"))).toBe("9 折")
        expect(couponFaceText(rate, "en-US", renderT("en-US"))).toBe("10% off")
    })

    it("两者皆无：给占位符「—」（不是空串，也不是 key）", () => {
        expect(couponFaceText(undefined, "zh-Hans-CN", renderT("zh-Hans-CN"))).toBe("—")
    })
})

describe("fact 里的金额", () => {
    it("券面额不带无意义的尾零", () => {
        expect(couponMoneyText(money(10000), "zh-Hans-CN")).toBe("¥100")
        expect(couponMoneyText(money(990), "zh-Hans-CN")).toBe("¥9.9")
    })
})
