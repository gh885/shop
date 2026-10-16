import type { CouponFaceValue, CouponRate, CouponRule } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"

import type { WebTranslate } from "#/locales/messages.gen"

function rateSlot(rate: CouponRate, locale: AppLocale): string {
    return locale === "zh-Hans-CN" ? rate.tenths : rate.percent
}

export function couponRuleText(rule: CouponRule, locale: AppLocale, t: WebTranslate): string {
    if (rule.kind === "reduction") {
        return rule.threshold === undefined
            ? t("coupon.rule.reduction.noThreshold", { discount: rule.discount })
            : t("coupon.rule.reduction.threshold", {
                  threshold: rule.threshold,
                  discount: rule.discount,
              })
    }
    const rate = rateSlot(rule.rate, locale)
    if (rule.threshold === undefined) {
        return rule.cap === undefined
            ? t("coupon.rule.rate.noThreshold", { rate })
            : t("coupon.rule.rate.noThresholdCapped", { rate, cap: rule.cap })
    }
    return rule.cap === undefined
        ? t("coupon.rule.rate.threshold", { threshold: rule.threshold, rate })
        : t("coupon.rule.rate.thresholdCapped", {
              threshold: rule.threshold,
              rate,
              cap: rule.cap,
          })
}

export function couponFaceText(value: CouponFaceValue, locale: AppLocale, t: WebTranslate): string {
    if (value === undefined) return "—"
    if (value.kind === "money") return value.text
    return t("coupon.face.rate", { rate: rateSlot(value.rate, locale) })
}
