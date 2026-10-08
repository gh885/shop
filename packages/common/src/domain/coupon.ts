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
import { AdminCouponItemSchema, CreateCouponTemplateRequestSchema } from "@shop/api/schemas"
import type { AppLocale } from "../i18n/locale"
import type { Money } from "./money"
import { compactMoneyText, isPositiveMoney } from "./money"

/**
 * 券名上限（字）：卖家建券表单的 `maxLength`，镜像后端 `coupon/dto/CouponFieldRules.NAME_MAX`
 * 与契约 `CreateCouponTemplateRequest.name.maxLength`（落点 `coupon.coupon_templates.name` 同宽）。
 *
 * 与商家「公司名称」那格同为 60 但是两个概念，刻意不共用常量——按数字合并会把两件不相干的事绑成一次改动。
 */
export const COUPON_NAME_MAX = CreateCouponTemplateRequestSchema.properties.name.maxLength

/**
 * 金额文案（含币种符号、整元语义）：券面上出现的那笔钱。
 *
 * 「满 1000 减 100」写成「满 ¥1000.00」会挤爆卡片，也会让人误以为角分是券的一部分——券面额是整元语义，
 * 所以走 `compactMoneyText`（尾零按值收：10000 分 → 0 位、990 分 → 1 位、1050 分 → 2 位），
 * 而不是 `formatMoney` 的恒两位。
 *
 * 这三个函数（`couponMoneyText` / `couponThresholdText` / `couponRuleText`）**仍拼中文句子**
 * （满 / 减 / 无门槛 / 可用），而 `@shop/common` 按§4.1 不承载用户可见文案——这是已知欠账，
 * 归 i18n P2 那批（句子进 catalog、`t()` 出句子）。本次只把**金额那一半**交给 `Intl`：
 * 手写的 `currencySymbol` + `groupYuan` + 字符串 `slice` 三段都删了。
 */
export function couponMoneyText(m: Money, locale: AppLocale): string {
    return compactMoneyText(m, locale)
}

/**
 * 满减型规则的**结构化事实**（不是句子）。
 *
 * 「满 ¥100 减 ¥10」/「无门槛减 ¥10」这句中文由各端 catalog 出（`t("coupon.rule.…")`），
 * common 只给「门槛有/无 + 两个金额」——§4.1 说 common 不承载用户可见文案，而「减」这个字
 * 在英文里是 `off`、在别的语言里又不一样，钉在 common 就是钉一种语言。
 * 金额已经是 `Intl` 格式化好的文本（{@link couponMoneyText}），fact 里不再带 Money。
 */
export type CouponReductionRule = {
    kind: "reduction"
    /** 门槛金额文本；`undefined` = 无门槛（0 门槛不是「满 ¥0」，那半句是废话） */
    threshold?: string
    /** 减免金额文本 */
    discount: string
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

/**
 * 折扣率的两个表示：**十分位**（9）与**百分比**（10）。
 *
 * 为什么要两个：中文说「九折」= 打九折 = 减 10%，英文说 `10% off`。同一个 0.9 在两种语言里
 * 要的不是同一个数字，所以 fact 把两种都带上，catalog 各取各的槽位——在 common 里挑一个就等于
 * 替另一种语言做了决定（`{tenths} off` 会印出「9 off」这种错话）。
 *
 * 算式：十分位 = rate × 10（0.90 → 9、0.95 → 9.5），百分比 = (1 − rate) × 100（0.90 → 10）。
 * 两边都去尾（整数不带 `.0`），且按四舍五入而非截断——折扣率差半个百分点是用户能看出来的。
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
 * 折扣型规则的**结构化事实**（不是句子）。
 *
 * 「满 ¥100 打 9 折，最高减 ¥50」由各端 catalog 出，common 只给数（见 {@link CouponReductionRule}
 * 顶上那段为什么是「事实」而不是「文案」）。`cap` 单独一格是 CPN-65 的硬要求：封顶不写进这句话，
 * 折扣券在用户眼里就是「无限 9 折」，到大额订单上才发现封顶 = 把让利承诺变成用户被坑。
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

// 不可用原因（结算选券区的灰字解释）与券来源标签都是用户可见文案，一律在各端 catalog
// （§4.1：common 不承载文案）。见 apps/web/src/coupon/coupon.ts 的 unavailable-reason / source 键表；
// 未知/新码由调用方回退成码本身，common 这里不给中文、也不给兜底句。

/**
 * 已知券状态直接取生成契约：AdminCouponItem.status 的 Java 类型就是 UserCouponStatus。
 * 顺序沿用枚举声明序；买家 MyCouponResponse.status 仍是自由 string，未知值由展示层兜底。
 */
export const USER_COUPON_STATUSES = AdminCouponItemSchema.properties.status.enum

export type UserCouponStatus = (typeof USER_COUPON_STATUSES)[number]

// 状态徽章（文字 + 颜色）与状态标签一律在各端 catalog：§4.1 —— common 不承载用户可见文案，
// 「未使用/结算中/…」这句中文与配色是**买家视角**的读法，属 web 那张表；运营列表另有自己的
// 配色（VOID 对买家是中性描边、对运营是已做出的动作要读成红），两家的 labelKey 各指各的 catalog。
// 这里只留「有哪几个状态码」这份事实（USER_COUPON_STATUSES），谁念、念成什么颜色由持有该视角的端决定。
