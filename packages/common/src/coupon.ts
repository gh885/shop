/**
 * 优惠券的展示文案与规则换算（跨端共享：买家券包 / 结算选券区 / 卖家券列表）。
 *
 * 只做「把契约里的数字与码值翻译成人话」，**不含任何业务判定**：
 * 券能不能用由后端评估器给（`CouponAvailabilityView`），前端不重算门槛、不重算有效期——
 * 两处各算一遍必然有一天对不上，而"券显示能用、结算说不能用"是最刺眼的客诉。
 *
 * 文案口径（判据见 docs/reference/coupon-platform-practices.md §6.1）：
 * 一张券要能被**一句话**解释完 = 减多少 + 满多少（运费不计入）+ 能用在哪（店名）。
 * 凡是需要用户理解"顺序 / 叠加 / 分摊"的券，都不该出现在这一层。
 */
import type { CouponUnavailableReason } from "@shop/api"
import type { Money } from "./money"
import { currencySymbol, groupYuan } from "./money"

/**
 * 分 → 元（券文案专用）：去掉无意义的尾随 0（1000 → "10"、990 → "9.9"、1050 → "10.5"）。
 *
 * 「满 1000 减 100」写成「满 ¥1000.00」会挤爆卡片，也会让人误以为角分是券的一部分——券面额是整元语义。
 */
export function couponYuanText(m: Money): string {
    const text = (m.amount / 100).toFixed(2)
    const trimmed = text.endsWith(".00")
        ? text.slice(0, -3)
        : text.endsWith("0")
          ? text.slice(0, -1)
          : text
    return groupYuan(trimmed)
}

/** 金额文案（含币种符号）：券面上出现的那笔钱 */
export function couponMoneyText(m: Money): string {
    return `${currencySymbol(m.currency)}${couponYuanText(m)}`
}

/** 门槛文案：0 是「无门槛」而不是「满 ¥0」，后者会被读成一句废话 */
export function couponThresholdText(threshold: Money): string {
    return threshold.amount <= 0 ? "无门槛" : `满 ${couponMoneyText(threshold)} 可用`
}

/** 一句话规则："满 ¥100 减 ¥10" / "无门槛减 ¥10" */
export function couponRuleText(threshold: Money, discount: Money): string {
    return threshold.amount <= 0
        ? `无门槛减 ${couponMoneyText(discount)}`
        : `满 ${couponMoneyText(threshold)} 减 ${couponMoneyText(discount)}`
}

/**
 * 不可用原因码 → 一句话；可用（null/undefined）返回 undefined。
 *
 * 文案与后端 `CouponUnavailableReason.message()` 对齐：同一件事在两处说法不同，
 * 用户会以为是两回事（结算页说"未达门槛"、下单报错说"不满足使用条件"）。
 * 未知码回退成码本身而不是空串——宁可显示生僻词，也不要出现一张"不能用但不说为什么"的券。
 */
export function couponUnavailableReasonText(
    reason: CouponUnavailableReason | null | undefined,
): string | undefined {
    if (!reason) return undefined
    // 写成 Record<string, string> 而不是 Record<CouponUnavailableReason, string>：
    // 契约理论上穷尽，但线上先出现新码、前端还没跟上时，宁可显示码本身也不要显示空白。
    const labels: Record<string, string> = {
        NOT_EFFECTIVE: "优惠券尚未生效",
        EXPIRED: "优惠券已过期",
        THRESHOLD_NOT_MET: "未达到优惠券的使用门槛",
        CURRENCY_MISMATCH: "优惠券币种与本单不一致",
    }
    return labels[reason] ?? reason
}

/**
 * 券展示状态标签。取值即后端 `UserCouponStatus.name()`（券包页签的筛选值也是它）。
 *
 * `LOCKED` 是"已被未付款订单占用"，对用户说「结算中」比「已锁定」更像个状态而不是故障；
 * 未知码回退原码，理由同 {@link couponUnavailableReasonText}。
 */
export const COUPON_STATUS_LABEL: Record<string, string> = {
    UNUSED: "未使用",
    LOCKED: "结算中",
    USED: "已使用",
    EXPIRED: "已过期",
    VOID: "已作废",
}

export function couponStatusLabel(status: string): string {
    return COUPON_STATUS_LABEL[status] ?? status
}

/**
 * 券来源标签。`REFUND_RETURN` 必须让用户看见：券包里凭空多出一张券而没有解释，
 * 用户会以为是系统故障或营销骚扰；写明「退款补发」才是一次可理解的补偿。
 */
export const COUPON_SOURCE_LABEL: Record<string, string> = {
    CLAIM: "领取",
    REFUND_RETURN: "退款补发",
}

export function couponSourceLabel(source: string): string {
    return COUPON_SOURCE_LABEL[source] ?? source
}
