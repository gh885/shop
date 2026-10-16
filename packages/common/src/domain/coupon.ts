/**
 * 优惠券展示文案与规则换算（跨端共享：买家券包 / 结算选券 / 卖家券列表）。只做「把契约数字与码值翻译成人话」，**不含任何业务判定**：券能不能用由后端评估器 `CouponAvailabilityView` 给，前端不重算门槛、不重算有效期（两处各算一遍迟早对不上）。
 * 文案口径见 docs/reference/coupon-platform-practices.md §6.1：一张券一句话讲完 = 减多少 + 满多少（运费不计）+ 能用在哪（店名）。
 */
import { AdminCouponItemSchema, CreateCouponTemplateRequestSchema } from "@shop/api/schemas"
import type { AppLocale } from "@shop/i18n"
import type { Money } from "./money"
import { compactMoneyText, isPositiveMoney } from "./money"

/** 券名上限（字）：卖家建券表单的 `maxLength`，镜像后端 `coupon/dto/CouponFieldRules.NAME_MAX` 与契约。与商家「公司名称」同为 60 但是两个概念，刻意不共用常量（按数字合并会把两件不相干的事绑成一次改动） */
export const COUPON_NAME_MAX = CreateCouponTemplateRequestSchema.properties.name.maxLength

/**
 * 券面金额文案（含币种符号、整元语义）：走 `compactMoneyText`（尾零按值收：10000 分 → 0 位、990 → 1 位、1050 → 2 位），不是 `formatMoney` 的恒两位。⚠️ 本函数与 `couponThresholdText`/`couponRuleText` **仍拼中文句子**（满/减/无门槛），违反 §4.1（common 不承载用户可见文案），是已知欠账，归 i18n P2。
 */
export function couponMoneyText(m: Money, locale: AppLocale): string {
    return compactMoneyText(m, locale)
}

/**
 * 满减型规则的**结构化事实**（不是句子）。中文句子「满 ¥100 减 ¥10 / 无门槛减 ¥10」由各端 catalog 出，common 只给「门槛有/无 + 两个金额」——§4.1 common 不承载文案，且「减」在英文是 `off`、别的语言又不同，钉在 common 就是钉一种语言。金额已是 `Intl` 格式化好的文本，fact 里不再带 Money。
 */
export type CouponReductionRule = {
    kind: "reduction"
    /** 门槛金额文本；`undefined` = 无门槛（0 门槛不是「满 ¥0」，那半句是废话） */
    threshold?: string
    /** 减免金额文本 */
    discount: string
}

/** 券型（CPN-01）：满减券有定值面额，折扣券没有（面值随订单金额变，只能说「打几折 + 最高减多少」）。两类共用一个入参形状（契约里 `type` 必填、另两格可空），由本函数分流 */
export type CouponFace = {
    type: string
    /** 满减券的定值面额；DISCOUNT 型在契约里可空（缺省即「没有」），故这里是可选 */
    discount?: Money | null
    discountRate?: number | null
    maxDiscount?: Money | null | undefined
}

/**
 * 折扣率的两个表示：**十分位**（9）与**百分比**（10）。中文说「九折」= 减 10%、英文说 `10% off`——同一个 0.9 在两种语言要的不是同一个数字，所以 fact 两种都带上，catalog 各取各的槽位（在 common 里挑一个就等于替另一种语言做决定）。算式：十分位 = rate × 10、百分比 = (1 − rate) × 100；两边去尾、按四舍五入。
 */
export type CouponRate = {
    /** 十分位：「9」/「9.5」（中文「九折」那个数） */
    tenths: string
    /** 减去的百分比：「10」/「5」（英文 `10% off` 那个数） */
    percent: string
}

/** 折扣率 → 十分位 + 百分比（见 {@link CouponRate}）。入参是契约的 rate（0.9 = 九折） */
export function couponRate(rate: number): CouponRate {
    const tenthsValue = Math.round(rate * 100) / 10
    const percentValue = Math.round((1 - rate) * 100)
    return { tenths: trimDecimal(tenthsValue), percent: String(percentValue) }
}

/** 整数不带 `.0`（9 而不是 9.0），非整数保留一位（8.5） */
function trimDecimal(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * 折扣型规则的**结构化事实**（不是句子，同 {@link CouponReductionRule}）。句子由各端 catalog 出，common 只给数。`cap` 单独一格是 CPN-65 硬要求：封顶不写进这句话，折扣券在用户眼里就是「无限 9 折」，到大额订单才发现封顶 = 把让利承诺变成被坑。
 */
export type CouponRateRule = {
    kind: "rate"
    threshold?: string
    rate: CouponRate
    /** 封顶金额文本；`undefined` = 无封顶 */
    cap?: string
}

/** 一句话规则的结构化事实：两型通吃（判据同 `couponRule`，见各自注释） */
export type CouponRule = CouponReductionRule | CouponRateRule

/** 满减型规则的事实（结算选券区那种只给门槛与面额的场景直接用它，不必造一个 face） */
export function couponReductionRule(
    threshold: Money,
    discount: Money,
    locale: AppLocale,
): CouponReductionRule {
    return {
        kind: "reduction",
        threshold: isPositiveMoney(threshold) ? couponMoneyText(threshold, locale) : undefined,
        discount: couponMoneyText(discount, locale),
    }
}

/**
 * 券面规则 → 结构化事实（两型通吃，与运行时的两型分流同一条）。
 *
 * 分流次序：DISCOUNT 型且带 `discountRate` → 折扣型；否则有 `discount` → 满减型；
 * 都没有 → 折扣型但 `rate` 为空（调用点自己决定怎么兜，common 不给「—」那句占位）。
 */
export function couponRule(threshold: Money, face: CouponFace, locale: AppLocale): CouponRule {
    const thresholdText = isPositiveMoney(threshold)
        ? couponMoneyText(threshold, locale)
        : undefined
    if (face.type === "DISCOUNT" && face.discountRate != null) {
        const cap = face.maxDiscount ? couponMoneyText(face.maxDiscount, locale) : undefined
        return { kind: "rate", threshold: thresholdText, rate: couponRate(face.discountRate), cap }
    }
    return {
        kind: "reduction",
        threshold: thresholdText,
        discount: face.discount ? couponMoneyText(face.discount, locale) : "",
    }
}

/** 券面大字那一格的事实：满减给金额、折扣给折扣率、两者皆无给 `undefined`（占位由调用点出） */
export type CouponFaceValue =
    | { kind: "money"; text: string }
    | { kind: "rate"; rate: CouponRate }
    | undefined

export function couponFaceValue(face: CouponFace, locale: AppLocale): CouponFaceValue {
    if (face.type === "DISCOUNT" && face.discountRate != null) {
        return { kind: "rate", rate: couponRate(face.discountRate) }
    }
    if (face.discount) return { kind: "money", text: couponMoneyText(face.discount, locale) }
    return undefined
}

// 不可用原因与券来源标签都是用户可见文案，一律在各端 catalog（§4.1 common 不承载文案），见 apps/web/src/coupon/coupon.ts 的 unavailable-reason / source 键表；未知/新码由调用方回退成码本身，common 不给中文也不给兜底句。

/** 已知券状态直接取生成契约（`AdminCouponItem.status` 的 Java 类型就是 UserCouponStatus），顺序沿用枚举声明序；买家 `MyCouponResponse.status` 仍是自由 string，未知值由展示层兜底 */
export const USER_COUPON_STATUSES = AdminCouponItemSchema.properties.status.enum

export type UserCouponStatus = (typeof USER_COUPON_STATUSES)[number]

// 状态徽章（文字 + 颜色）与状态标签一律在各端 catalog（§4.1 common 不承载文案）：这套配色是**买家视角**读法，运营列表另有自己的（VOID 对买家中性描边、对运营是已做出的动作要读成红）。这里只留「有哪几个状态码」这份事实（USER_COUPON_STATUSES），谁念、念成什么颜色由持有该视角的端决定。
