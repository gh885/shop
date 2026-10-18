import type { CouponRate, CouponRule } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"

import { appKitMessage } from "./message"
import { translateAppKitFact } from "./messages"

// 券规则文案是 web/seller 逐字相同的同一概念：句子只住 app-kit catalog（coupon.json）一份，
// 事实与渲染收在本文件——各端渲染点只调 couponRuleText。与 errorKeyFor/errorText 同构
// （结构化事实 → 共享 catalog key → 句子）；common 看不到 app-kit（依赖方向），故收在 app-kit。

/** 折扣率的展示值：中文说「9 折」取十分位，英文说「10% off」取百分比；改成单一表示另一语言就错 */
export function couponRateSlot(rate: CouponRate, locale: AppLocale): string {
    return locale === "zh-Hans-CN" ? rate.tenths : rate.percent
}

/**
 * 券规则 → 消息事实（不产句子、不渲染、不收 t）。封顶必进 params：CPN-65，
 * 不写封顶的折扣券在用户眼里就是无限折扣。返回判别联合（message 与 params 一一对应）；
 * 渲染走 couponRuleText，单独外露是给路由测试与「只要 key 不要句子」的场合。
 */
export function couponRuleFact(rule: CouponRule, locale: AppLocale) {
    if (rule.kind === "reduction") {
        return rule.threshold === undefined
            ? appKitMessage("coupon.rule.reduction.noThreshold", { discount: rule.discount })
            : appKitMessage("coupon.rule.reduction.threshold", {
                  threshold: rule.threshold,
                  discount: rule.discount,
              })
    }
    const rate = couponRateSlot(rule.rate, locale)
    if (rule.threshold === undefined) {
        return rule.cap === undefined
            ? appKitMessage("coupon.rule.rate.noThreshold", { rate })
            : appKitMessage("coupon.rule.rate.noThresholdCapped", { rate, cap: rule.cap })
    }
    return rule.cap === undefined
        ? appKitMessage("coupon.rule.rate.threshold", { threshold: rule.threshold, rate })
        : appKitMessage("coupon.rule.rate.thresholdCapped", {
              threshold: rule.threshold,
              rate,
              cap: rule.cap,
          })
}

/** 券规则 → 句子：消费出口（各端渲染点只用这个；判别联合的宽口收在 translateAppKitFact 一处） */
export function couponRuleText(rule: CouponRule, locale: AppLocale): string {
    return translateAppKitFact(couponRuleFact(rule, locale), locale)
}
