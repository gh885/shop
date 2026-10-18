import type { CouponFaceValue } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"

import { couponRateSlot } from "@shop/app-kit/i18n"

import type { WebTranslate } from "#/locales/messages.gen"

// 券面大字：买家单端展示，不跨端重复，故保留 web 本地（face.rate 是 web 本地 key）；
// 折扣档算法与规则句共用 app-kit 的 couponRateSlot，规则句本体走 couponRuleText。
export function couponFaceText(value: CouponFaceValue, locale: AppLocale, t: WebTranslate): string {
    if (value === undefined) return "—"
    if (value.kind === "money") return value.text
    return t("coupon.face.rate", { rate: couponRateSlot(value.rate, locale) })
}
