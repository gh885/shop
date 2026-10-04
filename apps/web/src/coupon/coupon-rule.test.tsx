import { describe, expect, it } from "vite-plus/test"
import { renderHook } from "@testing-library/react"

import { couponMoneyText, money } from "@shop/common/domain"
import { I18nProvider } from "@shop/app-kit/i18n"
import { createAppI18n } from "@shop/app-kit/i18n"

import { couponFaceText, couponRuleText } from "./coupon-rule"
import { webMessages } from "#/locales"
import { useT } from "#/locales/use-t"
import type { AppLocale } from "@shop/common/i18n"
import type { ReactNode } from "react"

/**
 * 事实 → 句子这一层的用例。
 *
 * 它钉的是**分派表**（门槛有/无 × 满减/折扣 × 有无封顶）与**「这个语言用哪个数」**（十分位 vs 百分比），
 * 句子本身的措辞归 catalog（措辞改了这里会红，那正是想要的：改文案要有人看一眼）。
 * common 那侧钉的是「fact 里该有的字段有、该缺的标成 undefined」（`@shop/common` 的 coupon.test.ts）。
 *
 * **t 来自真实的 useT()**（renderHook 挂真的 I18nProvider + webMessages），不是拿 resolveMessage
 * 手搓一个再强转成 Translate：那份强转是「宽形状 t」那类反模式（i18n.md §5.5），而用真 Provider 还顺带
 * 验了 catalog 真的挂上了（漏挂时这里是「回落成 key」而不是测试通过）。
 */
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
        const t = renderT("zh-CN")
        expect(
            couponRuleText({ kind: "reduction", threshold: "¥100", discount: "¥10" }, "zh-CN", t),
        ).toBe("满 ¥100 减 ¥10")
        expect(
            couponRuleText(
                { kind: "reduction", threshold: undefined, discount: "¥10" },
                "zh-CN",
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
        expect(couponRuleText(rule, "zh-CN", renderT("zh-CN"))).toBe("满 ¥100 打 9 折")
        expect(couponRuleText(rule, "en-US", renderT("en-US"))).toBe("10% off when you spend ¥100")
    })

    it("封顶必进句子（CPN-65）：不写封顶的折扣券在用户眼里就是无限折扣", () => {
        const capped = {
            kind: "rate",
            threshold: "¥100",
            rate: { tenths: "9", percent: "10" },
            cap: "¥50",
        } as const
        expect(couponRuleText(capped, "zh-CN", renderT("zh-CN"))).toBe(
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
                "zh-CN",
                renderT("zh-CN"),
            ),
        ).toBe("无门槛打 8 折，最高减 ¥30")
    })
})

describe("couponFaceText", () => {
    it("满减型给金额，折扣型给折扣率（中文十分位 / 英文百分比）", () => {
        expect(couponFaceText({ kind: "money", text: "¥10" }, "zh-CN", renderT("zh-CN"))).toBe(
            "¥10",
        )
        const rate = { kind: "rate", rate: { tenths: "9", percent: "10" } } as const
        expect(couponFaceText(rate, "zh-CN", renderT("zh-CN"))).toBe("9 折")
        expect(couponFaceText(rate, "en-US", renderT("en-US"))).toBe("10% off")
    })

    it("两者皆无：给占位符「—」（不是空串，也不是 key）", () => {
        expect(couponFaceText(undefined, "zh-CN", renderT("zh-CN"))).toBe("—")
    })
})

/** 券面金额仍是整元语义：这条由 compactMoneyText 负责，这里只确认 fact 里那半是它给的文本 */
describe("fact 里的金额", () => {
    it("券面额不带无意义的尾零", () => {
        expect(couponMoneyText(money(10000), "zh-CN")).toBe("¥100")
        expect(couponMoneyText(money(990), "zh-CN")).toBe("¥9.9")
    })
})
