import { describe, expect, it } from "vite-plus/test"

import type { MyCouponResponse } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import { createAppI18n } from "@shop/app-kit/i18n"
import { translate, type AppLocale, type MessageParams } from "@shop/i18n"
import { makeMyCouponResponse as makeContractCoupon } from "@shop/test-utils/fixtures"

import { COUPON_TABS, couponFaceText, couponTimeReasonHint } from "./display"
import type { MyCoupon } from "./rules"
import { toMyCoupon } from "./mapper"
import { webMessages } from "#/locales"
import type { WebTranslate } from "#/locales/messages.gen"

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1"
const COUPON_ID = "00000000-0000-4000-8000-0000000000c1"

function makeMyCouponResponse(overrides: Partial<MyCouponResponse> = {}): MyCouponResponse {
    return makeContractCoupon({ id: COUPON_ID, shopId: SHOP_ID, ...overrides })
}

function makeMyCoupon(overrides: Partial<MyCoupon> = {}): MyCoupon {
    return { ...toMyCoupon(makeMyCouponResponse()), ...overrides }
}

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

describe("COUPON_TABS", () => {
    it("页签从状态表派生 catalog 键_与卡片徽章读同一张表（不再是手抄的中文）", () => {
        expect(COUPON_TABS).toEqual([
            { value: "UNUSED", labelKey: "coupon.status.UNUSED" },
            { value: "USED", labelKey: "coupon.status.USED" },
            { value: "EXPIRED", labelKey: "coupon.status.EXPIRED" },
        ])
    })
})

describe("couponTimeReasonHint", () => {
    it("还没生效的券_灰字给出起用时间，日期按传入的 Locale 渲染", () => {
        const coupon = makeMyCoupon({ unavailableReason: "NOT_EFFECTIVE" })

        expect(couponTimeReasonHint(coupon, "zh-Hans-CN")).toEqual({
            key: "coupon.reason.notEffective",
            datetime: formatDateTime(coupon.effectiveAt, "zh-Hans-CN"),
        })
        expect(couponTimeReasonHint(coupon, "en-US")).toEqual({
            key: "coupon.reason.notEffective",
            datetime: formatDateTime(coupon.effectiveAt, "en-US"),
        })
    })

    it("结算中但时间已过的券_说清本单之外不能再使用", () => {
        expect(
            couponTimeReasonHint(
                makeMyCoupon({ status: "LOCKED", unavailableReason: "EXPIRED" }),
                "zh-Hans-CN",
            ),
        ).toEqual({ key: "coupon.reason.expired" })
    })

    it("徽章已解释过的过期不再重复_状态是 EXPIRED 时不给灰字", () => {
        expect(
            couponTimeReasonHint(
                makeMyCoupon({ status: "EXPIRED", unavailableReason: "EXPIRED" }),
                "zh-Hans-CN",
            ),
        ).toBeUndefined()
    })

    it("用掉作废的券不承担解释义务_/已使用、已作废一律不给", () => {
        for (const status of ["USED", "VOID"]) {
            expect(
                couponTimeReasonHint(
                    makeMyCoupon({ status, unavailableReason: "EXPIRED" }),
                    "zh-Hans-CN",
                ),
            ).toBeUndefined()
        }
    })

    it("没有原因的券不给灰字_不凭空补一句解释", () => {
        expect(couponTimeReasonHint(makeMyCoupon(), "zh-Hans-CN")).toBeUndefined()
    })

    it("契约给出新的原因码_不硬翻译成一句假解释", () => {
        expect(
            couponTimeReasonHint(
                makeMyCoupon({ unavailableReason: "THRESHOLD_NOT_MET" }),
                "zh-Hans-CN",
            ),
        ).toBeUndefined()
    })
})
