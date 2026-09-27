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
import { currencySymbol, fenToYuan, groupYuan, isPositiveMoney } from "./money"

/**
 * 券名上限（字）：卖家建券表单的 `maxLength`，镜像后端 `coupon/dto/CouponFieldRules.NAME_MAX`
 * 与契约 `CreateCouponTemplateRequest.name.maxLength`（落点 `coupon.coupon_templates.name` 同宽）。
 *
 * 与商家「公司名称」那格同为 60 但是两个概念，刻意不共用常量——按数字合并会把两件不相干的事绑成一次改动。
 */
export const COUPON_NAME_MAX = 60

/**
 * 券名超限提示（后端 `CouponFieldRules.NAME_MESSAGE`，逐字节）：文案里那个数就是它约束的那个数，
 * 由 `${COUPON_NAME_MAX}` 插值而来，改上限时提示语跟着走，不必再回头改第二处。
 */
export const COUPON_NAME_MESSAGE = `券名最多 ${COUPON_NAME_MAX} 字`

/**
 * 分 → 元（券文案专用）：去掉无意义的尾随 0（1000 → "10"、990 → "9.9"、1050 → "10.5"）。
 *
 * 「满 1000 减 100」写成「满 ¥1000.00」会挤爆卡片，也会让人误以为角分是券的一部分——券面额是整元语义。
 */
export function couponYuanText(m: Money): string {
    const text = fenToYuan(m.amount)
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
    return isPositiveMoney(threshold) ? `满 ${couponMoneyText(threshold)} 可用` : "无门槛"
}

/** 一句话规则："满 ¥100 减 ¥10" / "无门槛减 ¥10" */
export function couponRuleText(threshold: Money, discount: Money): string {
    return isPositiveMoney(threshold)
        ? `满 ${couponMoneyText(threshold)} 减 ${couponMoneyText(discount)}`
        : `无门槛减 ${couponMoneyText(discount)}`
}

/**
 * 券型（CPN-01）：满减与折扣两类，面值的说法不同。
 *
 * 满减券有定值面额，折扣券没有——它的面值随订单金额变，能说出口的只有「打几折 + 最高减多少」。
 * 两类共用一个入参形状（契约里 `type` 必填、另两格可空），由本函数分流。
 */
export type CouponFace = {
    type: string
    /** 满减券的定值面额；DISCOUNT 型在契约里可空（缺省即「没有」），故这里是可选 */
    discount?: Money | null
    discountRate?: number | null
    maxDiscount?: Money | null | undefined
}

/** 折扣率 → 「9 折」/「9.5 折」：0.90 读成 9 折，0.95 读成 9.5 折（乘 10 后去掉无意义的 .0） */
export function couponRateText(rate: number): string {
    const tenths = Math.round(rate * 100) / 10
    return `${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)} 折`
}

/** 券面的大字那一格：满减给金额，折扣给「9 折」（配封顶写在规则行里） */
export function couponFaceText(face: CouponFace): string {
    if (face.type === "DISCOUNT" && face.discountRate != null) {
        return couponRateText(face.discountRate)
    }
    return face.discount ? couponMoneyText(face.discount) : "—"
}

/**
 * 一句话规则（两型通吃）：满减 → 「满 ¥100 减 ¥10」；折扣 → 「满 ¥100 打 9 折，最高减 ¥50」。
 *
 * 封顶必须写进这句话（CPN-65）：不写封顶的折扣券在用户眼里就是「无限 9 折」，
 * 到大额订单上才发现封顶，是把平台的让利承诺变成了用户的被坑。
 */
export function couponFaceRuleText(threshold: Money, face: CouponFace): string {
    const prefix = isPositiveMoney(threshold) ? `满 ${couponMoneyText(threshold)} ` : "无门槛"
    if (face.type === "DISCOUNT" && face.discountRate != null) {
        const cap = face.maxDiscount ? `，最高减 ${couponMoneyText(face.maxDiscount)}` : ""
        return `${prefix}打 ${couponRateText(face.discountRate)}${cap}`
    }
    return face.discount ? `${prefix}减 ${couponMoneyText(face.discount)}` : prefix
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
 * 券展示状态的已知取值：后端 `UserCouponStatus.name()`，次序即状态机走向
 * （未使用 → 结算中 → 已使用 → 已过期 → 已作废）。
 *
 * 写成 tuple 而不是散在 union 里，是因为「有哪几个值」这份数据运行时要用到：
 * 按状态排序的 rank、URL 校验的 z.enum、页签/筛选项的派生。一处登记，类型与值同时跟上。
 *
 * 契约上 `MyCouponResponse.status` 是自由 string（后端把「库里还 UNUSED 但事实已过期」折叠成
 * EXPIRED 展示），所以这里按**已知取值**穷尽声明，查表走 {@link couponStatusMeta} 的兜底那条路。
 */
export const USER_COUPON_STATUSES = ["UNUSED", "LOCKED", "USED", "EXPIRED", "VOID"] as const

export type UserCouponStatus = (typeof USER_COUPON_STATUSES)[number]

/**
 * 徽章皮肤：这四个字面量都必须在 ui-web `Badge` 的 variant 里真实存在。
 * `@shop/common` 不依赖 ui-web（依赖方向：common → @shop/api 为止），所以只能把允许的值列在这里——
 * 加一档之前先去 badge.tsx 确认有那一档，否则三端拿到的是一个没有样式的 class。
 */
type CouponBadgeVariant = "success" | "warning" | "secondary" | "outline"

type CouponStatusDisplay = { label: string; variant: CouponBadgeVariant }

/**
 * 券展示状态 → 「叫什么 + 什么颜色」：文字与徽章一张表，不设平行表。
 *
 * 分成两张就得每次加状态改两处，漏一处得到「新状态没颜色」；页签那类只吃文字的地方走
 * `statusOptions` / {@link couponStatusLabel} 从这张表派生，一个状态只有一句中文。
 *
 * `LOCKED` 是"已被未付款订单占用"，对用户说「结算中」比「已锁定」更像个状态而不是故障。
 *
 * 卖家券列表**不**共用这张表，那不是重复：卖家看的不是「这张券在你包里的处境」（未使用/结算中），
 * 而是「这个活动跑到哪一段」（未开始/进行中/已结束/已停用）——两套词说两件不同的事，
 * 强行并成一张表只会让一方读另一方的话，见 `apps/seller/src/coupon/model.ts` 里那张派生表。
 */
export const COUPON_STATUS_META: Record<UserCouponStatus, CouponStatusDisplay> = {
    UNUSED: { label: "未使用", variant: "success" },
    LOCKED: { label: "结算中", variant: "warning" },
    USED: { label: "已使用", variant: "secondary" },
    EXPIRED: { label: "已过期", variant: "outline" },
    VOID: { label: "已作废", variant: "outline" },
}

/** 同一张表的 string 索引视图：契约给的 status 是自由 string，查表得容得下表里没有的码 */
const STATUS_BY_KEY: Record<string, CouponStatusDisplay | undefined> = COUPON_STATUS_META

/**
 * 查表：契约先出现新状态、这张表还没跟上时，回退成「码本身 + 中性描边」——
 * 宁可显示生僻词，也不要出现一张既没解释又没颜色的券（理由同 {@link couponUnavailableReasonText}）。
 */
export function couponStatusMeta(status: string): CouponStatusDisplay {
    return STATUS_BY_KEY[status] ?? { label: status, variant: "outline" }
}

/** 状态标签（页签、分组标题只要文字的那两处）：与徽章同源，不另写一份中文 */
export function couponStatusLabel(status: string): string {
    return couponStatusMeta(status).label
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
