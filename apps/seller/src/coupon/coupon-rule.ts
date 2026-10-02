import type { CouponRule } from "@shop/common/domain"
import type { AppLocale } from "@shop/common/i18n"

import type { SellerTranslate } from "#/locales/messages.gen"

/**
 * 卖家端券列表的「一句话规则」：从**结构化事实**出句子。
 *
 * 与买家端 `web/src/coupon/coupon-rule.ts` 是同一件事的两份实现——各自 catalog 的 key 不同，
 * 但形状与判据同源（`couponRate` 的两种表示、封顶那格是 CPN-65 的硬要求）。
 * 改判据（例如加第三种券型）时两处一起改，codegen 的 key 平齐检查会挡住漏补的那一侧。
 *
 * **十分位 / 百分比按语言选数**：中文说「九折」，英文说 `10% off`。catalog 里只留一个 `{rate}` 槽位
 * （两侧占位符集合必须平齐，§5.5 契约 4），数字由这里按 locale 选，单位词留在句子里。
 */
function rateSlot(rule: Extract<CouponRule, { kind: "rate" }>, locale: AppLocale): string {
    return locale === "zh-CN" ? rule.rate.tenths : rule.rate.percent
}

export function couponRuleText(rule: CouponRule, locale: AppLocale, t: SellerTranslate): string {
    if (rule.kind === "reduction") {
        return rule.threshold === undefined
            ? t("seller.coupon.rule.reduction.noThreshold", { discount: rule.discount })
            : t("seller.coupon.rule.reduction.threshold", {
                  threshold: rule.threshold,
                  discount: rule.discount,
              })
    }
    const rate = rateSlot(rule, locale)
    if (rule.threshold === undefined) {
        return rule.cap === undefined
            ? t("seller.coupon.rule.rate.noThreshold", { rate })
            : t("seller.coupon.rule.rate.noThresholdCapped", { rate, cap: rule.cap })
    }
    return rule.cap === undefined
        ? t("seller.coupon.rule.rate.threshold", { threshold: rule.threshold, rate })
        : t("seller.coupon.rule.rate.thresholdCapped", {
              threshold: rule.threshold,
              rate,
              cap: rule.cap,
          })
}
