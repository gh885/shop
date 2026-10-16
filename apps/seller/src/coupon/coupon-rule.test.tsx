import { describe, expect, it } from "vite-plus/test"
import { renderHook } from "@testing-library/react"

import { I18nProvider, createAppI18n } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/i18n"
import type { ReactNode } from "react"

import { couponRuleText } from "./coupon-rule"
import { sellerMessages } from "#/locales"
import { useT } from "#/locales/use-t"

function renderT(locale: AppLocale) {
    const i18n = createAppI18n(locale, sellerMessages)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <I18nProvider i18n={i18n}>{children}</I18nProvider>
    )
    const { result } = renderHook(() => useT(), { wrapper })
    return result.current
}

describe("couponRuleText", () => {
    it("满减型：有门槛 / 无门槛分开", () => {
        expect(
            couponRuleText(
                { kind: "reduction", threshold: "¥100", discount: "¥10" },
                "zh-Hans-CN",
                renderT("zh-Hans-CN"),
            ),
        ).toBe("满 ¥100 减 ¥10")
        expect(
            couponRuleText(
                { kind: "reduction", threshold: undefined, discount: "¥10" },
                "zh-Hans-CN",
                renderT("zh-Hans-CN"),
            ),
        ).toBe("无门槛减 ¥10")
    })

    it("折扣型：中文用十分位，英文用百分比", () => {
        const rule = {
            kind: "rate",
            threshold: "¥100",
            rate: { tenths: "9", percent: "10" },
        } as const
        expect(couponRuleText(rule, "zh-Hans-CN", renderT("zh-Hans-CN"))).toBe("满 ¥100 打 9 折")
        expect(couponRuleText(rule, "en-US", renderT("en-US"))).toBe("10% off when you spend ¥100")
    })

    it("封顶必进句子（CPN-65）", () => {
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

    it("无门槛 + 折扣：第四种组合", () => {
        expect(
            couponRuleText(
                { kind: "rate", threshold: undefined, rate: { tenths: "8", percent: "20" } },
                "zh-Hans-CN",
                renderT("zh-Hans-CN"),
            ),
        ).toBe("无门槛打 8 折")
    })
})
