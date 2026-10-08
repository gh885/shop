import type { CouponFaceValue, CouponRate, CouponRule } from "@shop/common/domain"
import type { AppLocale } from "@shop/common/i18n"

import type { WebTranslate } from "#/locales/messages.gen"

/**
 * 券的「一句话规则」与「券面大字」从**结构化事实**出句子（事实由 `@shop/common` 的
 * `couponRule` / `couponFaceValue` 给）。
 *
 * **为什么不是让 common 直接返回中文句子**：`@shop/common` 按 i18n §4.1 不承载用户可见文案，
 * 而「满 ¥100 减 ¥10」里的「减」在英文里是 `off`、在别的语言里又不一样。common 只给数
 * （门槛有/无、金额文本、折扣的两种表示、封顶），句子归各端 catalog。
 */

/**
 * 一个折扣率在当前语言下该用哪个数：中文说「九折」= 打九折，英文说 `10% off`。
 *
 * **为什么 catalog 里只有一个 `{rate}` 槽位、而这里按语言选数**：codegen 要求同一 key 在两种语言里
 * 占位符**集合相同**（§5.5 契约 4），而「九折」与「10% off」是两个不同的数。槽位统一成 `{rate}`、
 * 数字由本函数按 locale 选，单位词（「折」/「% off」）留在句子文本里——这样「这个语言用哪种说法」
 * 是一个显式的、可读的判断，而不是在 catalog 里写两条形状不同的句子（那正是要避开的：句子归翻译，
 * 数的选择归知道 locale 的这层）。
 */
function rateSlot(rate: CouponRate, locale: AppLocale): string {
    return locale === "zh-Hans-CN" ? rate.tenths : rate.percent
}

/**
 * 规则句的分派表。四种组合 = 门槛有/无 × 满减/折扣，折扣再多一层「有无封顶」——
 * 封顶那格是 CPN-65 的硬要求：不写进句子，折扣券在用户眼里就是「无限九折」。
 */
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

/**
 * 券面大字那一格：满减给金额、折扣给折扣率、两者皆无给占位符「—」。
 *
 * 占位符为什么在这一层而不是 common 或 catalog：它是**展示约定**（这一格没数时画什么），
 * `—` 在两种语言下是同一个符号，所以各端自己决定即可，不必为一个符号占两条 key。
 */
export function couponFaceText(value: CouponFaceValue, locale: AppLocale, t: WebTranslate): string {
    if (value === undefined) return "—"
    if (value.kind === "money") return value.text
    return t("coupon.face.rate", { rate: rateSlot(value.rate, locale) })
}
