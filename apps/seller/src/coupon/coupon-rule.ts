import type { CouponRule } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"

import type { SellerTranslate } from "#/locales/messages.gen"

// 折扣数按语言选：中文说「九折」（tenths），英文说「10% off」（percent）；改成单一表示另一语言就错
function rateSlot(rule: Extract<CouponRule, { kind: "rate" }>, locale: AppLocale): string {
    return locale === "zh-Hans-CN" ? rule.rate.tenths : rule.rate.percent
}

export function couponRuleText(rule: CouponRule, locale: AppLocale, t: SellerTranslate): string {
    if (rule.kind === "reduction") {
        return rule.threshold === undefined
            ? t("coupon.rule.reduction.noThreshold", { discount: rule.discount })
            : t("coupon.rule.reduction.threshold", {
                  threshold: rule.threshold,
                  discount: rule.discount,
              })
    }
    const rate = rateSlot(rule, locale)
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
