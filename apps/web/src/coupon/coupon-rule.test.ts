import { describe, expect, it } from "vite-plus/test"

import { createAppI18n } from "@shop/app-kit/i18n"
import { translate, type AppLocale, type MessageParams } from "@shop/i18n"

import { couponFaceText } from "./coupon-rule"
import { webMessages } from "#/locales"
import type { WebTranslate } from "#/locales/messages.gen"

// 券面大字是 web 单端展示函数（locale + 注入的 t → 句子），不碰 DOM。用 createAppI18n + translate
// 得到与运行时同一 i18next 实例解析的 t，省掉 renderHook + I18nProvider 那层装饰。
// 规则句的路由已上移 app-kit couponRuleFact，其测试在同名 app-kit 文件。
function tFor(locale: AppLocale): WebTranslate {
    const i18n = createAppI18n(locale, webMessages)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- key 与参数由本端 i18n:gen 生成类型限定，运行时按 locale 解析
    return ((key: string, params?: MessageParams) =>
        translate(i18n, key, params, locale)) as unknown as WebTranslate
}

describe("couponFaceText", () => {
    it("满减型给金额，折扣型给折扣率（中文十分位 / 英文百分比）", () => {
        expect(
            couponFaceText({ kind: "money", text: "¥10" }, "zh-Hans-CN", tFor("zh-Hans-CN")),
        ).toBe("¥10")
        const rate = { kind: "rate", rate: { tenths: "9", percent: "10" } } as const
        expect(couponFaceText(rate, "zh-Hans-CN", tFor("zh-Hans-CN"))).toBe("9 折")
        expect(couponFaceText(rate, "en-US", tFor("en-US"))).toBe("10% off")
    })

    it("两者皆无：给占位符「—」（不是空串，也不是 key）", () => {
        expect(couponFaceText(undefined, "zh-Hans-CN", tFor("zh-Hans-CN"))).toBe("—")
    })
})
