import { CreateCouponTemplateRequestSchema } from "@shop/api/schemas"
import { z } from "zod"

import type { CreateCouponTemplateRequest } from "@shop/api/sdk"
import {
    COUPON_NAME_MAX,
    isPositiveMoney,
    statusOptionsFromKeys,
    withMaxLength,
    yuanToFen,
    yuanToMoney,
    type KeyedStatusOption,
} from "@shop/common/domain"

import { messageFactFactory, type MessageFact } from "@shop/common/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

/**
 * coupon 域 · 表单层：Zod 校验 + 表单形状 → 后端请求的投影。
 *
 * 单位口径是这一层唯一要操心的事：用户在表单里填「元」，契约要「分」；
 * 表单里是 datetime-local 的本地墙钟字符串，契约要带时区的 ISO 时刻。
 * 两处换算都只在这里发生一次，页面组件不碰金额与时间。
 */

const COUPON_MAX_TOTAL = CreateCouponTemplateRequestSchema.properties.totalQuantity.maximum

/** 券型（镜像后端 `coupon.model.CouponType`）：满减与折扣 */
type CouponTypeCode = "FULL_REDUCTION" | "DISCOUNT"
type CouponTypeKey = Extract<SellerMessageKey, `seller.coupon.type.${string}`>

/**
 * 券型下拉项：中文走 catalog，穷尽性由表的 `Record<码值, key>` 锁死（§4.1——common 不带文案，
 * 这一格归 seller catalog）。旧的 `description` 字段（满减/折扣的一句话说明）在这里从不渲染
 * （`SelectField` 只读 `label`，见 ui-web/form.tsx），是死数据，本地化时一并去掉——
 * 「满减/折扣在发布页各填哪几格」的说明已由 `seller.coupon.form.intro` 那句承担，不复制第二份。
 */
export const COUPON_TYPE_ITEMS: ReadonlyArray<KeyedStatusOption<CouponTypeCode, CouponTypeKey>> =
    statusOptionsFromKeys<CouponTypeCode, CouponTypeKey>({
        FULL_REDUCTION: "seller.coupon.type.FULL_REDUCTION",
        DISCOUNT: "seller.coupon.type.DISCOUNT",
    })

/** 相对有效期档位（镜像后端 `CouponFieldRules.VALID_DAYS_MIN/MAX` 与库上 CHECK） */
export const VALID_DAYS_MIN = CreateCouponTemplateRequestSchema.properties.validDays.minimum
export const VALID_DAYS_MAX = CreateCouponTemplateRequestSchema.properties.validDays.maximum

/**
 * 校验消息只发**结构化事实**：`message` 是 catalog key、`params` 是要插进句子里的数据，
 * 句子由渲染边界按当前语言换出来（ui-web 的 FormErrorTranslateProvider，app-kit 灌 `t`）。
 * schema 因此与 locale 无关——模块级常量、切语言不重建不重校验。
 *
 * `err` 是 codegen 那份工厂按本域的 key 前缀**收窄**出来的（`messageFactFactory<CouponErrKey, …>`
 * 换掉此前手写的 `err()` / `errWith(key, params: Record<string, string | number>)` 一对）：
 * key 只收本域那几十条，而参数位跟着每条消息各自的槽位走——带参的少传、参数名写错、无参的多传，
 * 三种都编译不过。手写那版只把 key 收了窄、参数仍是宽 `Record`，两件事各做一半。
 *
 * 带数字的条款一律 `refine` / `ctx.addIssue`（`.max(N, …)` 那条 check 通道会把 `params` 丢掉，
 * 槽位填不上，用户看见裸的 `{max}`）；长度上下限用 `@shop/common/domain` 的 `withMaxLength`。
 */
type CouponErrKey = Extract<SellerMessageKey, `seller.coupon.form.err.${string}`>
const err = messageFactFactory<CouponErrKey, SellerParamsByKey>()

/** 金额格的两种错（必填 / 格式）：收**事实**而不是 key，收窄就发生在调用点那两个字面量上 */
const yuanField = (required: MessageFact<CouponErrKey>, format: MessageFact<CouponErrKey>) =>
    z
        .string()
        .trim()
        .min(1, required)
        .refine((value) => yuanToFen(value) !== undefined, format)

/** 跨字段条款只看这几个原始字符串（Zod 已过 trim/min 的形状） */
type CouponTermsShape = {
    type: "FULL_REDUCTION" | "DISCOUNT"
    thresholdYuan: string
    discountYuan: string
    discountRate: string
    maxDiscountYuan: string
    validDays: string
    validFrom: string
    validTo: string
}

/**
 * 折扣券的面值条款：不校验「面额 ≤ 门槛」（它没有定值面额），
 * 改判折率档位与封顶必填——封顶缺失的折扣券写不进库（DB CHECK），但那时是一句 500。
 */
function refineDiscountTerms(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    const rate = Number(value.discountRate)
    if (!value.discountRate || Number.isNaN(rate) || rate <= 0 || rate >= 1) {
        ctx.addIssue({
            code: "custom",
            path: ["discountRate"],
            ...err("seller.coupon.form.err.rateRange"),
        })
    }
    const cap = yuanToFen(value.maxDiscountYuan)
    if (value.maxDiscountYuan.trim() === "") {
        ctx.addIssue({
            code: "custom",
            path: ["maxDiscountYuan"],
            ...err("seller.coupon.form.err.maxDiscountRequired"),
        })
    } else if (cap === undefined || cap <= 0) {
        ctx.addIssue({
            code: "custom",
            path: ["maxDiscountYuan"],
            ...err("seller.coupon.form.err.maxDiscountFormat"),
        })
    }
}

/** 满减券的面值条款：面额必填且为正，且不得超过非零门槛 */
function refineReductionTerms(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    const threshold = yuanToFen(value.thresholdYuan)
    const discount = yuanToFen(value.discountYuan)
    if (value.discountYuan.trim() === "") {
        ctx.addIssue({
            code: "custom",
            path: ["discountYuan"],
            ...err("seller.coupon.form.err.discountRequired"),
        })
    } else if (discount === undefined || discount <= 0) {
        ctx.addIssue({
            code: "custom",
            path: ["discountYuan"],
            ...err("seller.coupon.form.err.discountPositive"),
        })
    }
    // 门槛为 0 时不受限：无门槛券的减免可以任意大
    if (
        threshold !== undefined &&
        threshold !== 0 &&
        discount !== undefined &&
        discount > threshold
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["discountYuan"],
            ...err("seller.coupon.form.err.discountOverThreshold"),
        })
    }
}

/** 相对有效期：留空合法；填了必须是 1~365 的整数（与库上 CHECK 同值） */
function refineValidDays(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    if (value.validDays.trim() === "") return
    const days = Number(value.validDays)
    if (!Number.isInteger(days) || days < VALID_DAYS_MIN || days > VALID_DAYS_MAX) {
        ctx.addIssue({
            code: "custom",
            path: ["validDays"],
            ...err("seller.coupon.form.err.validDaysRange", {
                min: VALID_DAYS_MIN,
                max: VALID_DAYS_MAX,
            }),
        })
    }
}

/** 发放窗口：两端都填了就必须 later-than，datetime-local 串未 parse 成功则本层不管（交给必填） */
function refineValidWindow(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    if (!value.validFrom || !value.validTo) return
    const from = Date.parse(value.validFrom)
    const to = Date.parse(value.validTo)
    if (!Number.isNaN(from) && !Number.isNaN(to) && to <= from) {
        ctx.addIssue({
            code: "custom",
            path: ["validTo"],
            ...err("seller.coupon.form.err.windowOrder"),
        })
    }
}

export const CouponFormSchema = z
    .object({
        name: withMaxLength(
            z.string().trim().min(1, err("seller.coupon.form.err.nameRequired")),
            COUPON_NAME_MAX,
            err("seller.coupon.form.err.nameMax", { max: COUPON_NAME_MAX }),
        ),
        type: z.enum(["FULL_REDUCTION", "DISCOUNT"]),
        /** 使用门槛（元）：0 = 无门槛（两型共用） */
        thresholdYuan: yuanField(
            err("seller.coupon.form.err.thresholdRequired"),
            err("seller.coupon.form.err.thresholdFormat"),
        ),
        /** 减免额（元）：仅满减券 */
        discountYuan: z.string().trim(),
        /** 折扣率（0.90 = 9 折）：仅折扣券 */
        discountRate: z.string().trim(),
        /** 折扣封顶（元）：仅折扣券，必填（CPN-65） */
        maxDiscountYuan: z.string().trim(),
        totalQuantity: z
            .string()
            .trim()
            .min(1, err("seller.coupon.form.err.totalRequired"))
            .refine((value) => {
                const quantity = Number(value)
                return Number.isInteger(quantity) && quantity >= 1
            }, err("seller.coupon.form.err.totalInt"))
            .refine(
                (value) => Number(value) <= COUPON_MAX_TOTAL,
                err("seller.coupon.form.err.totalMax", { max: COUPON_MAX_TOTAL }),
            ),
        validFrom: z.string().trim().min(1, err("seller.coupon.form.err.windowFromRequired")),
        validTo: z.string().trim().min(1, err("seller.coupon.form.err.windowToRequired")),
        /** 领取后 N 天有效：留空 = 券沿用发放窗口作为可用期（CPN-68） */
        validDays: z.string().trim(),
    })
    // 跨字段条款：后端也会挡（且是 400），但等一趟网络再报错不如在提交前说清楚。
    // 两型的面值条款各自成条，所以各自一个函数：superRefine 只做分派 + 两型共有的窗口校验。
    .superRefine((value, ctx) => {
        if (value.type === "DISCOUNT") {
            refineDiscountTerms(value, ctx)
        } else {
            refineReductionTerms(value, ctx)
        }
        refineValidDays(value, ctx)
        refineValidWindow(value, ctx)
    })

export type CouponFormValues = z.infer<typeof CouponFormSchema>

/** 新建表单的初始值：空字符串 + 一个合理的默认量，避免用户从 0 开始调 */
export function emptyCouponForm(): CouponFormValues {
    return {
        name: "",
        type: "FULL_REDUCTION",
        thresholdYuan: "0",
        discountYuan: "",
        discountRate: "",
        maxDiscountYuan: "",
        totalQuantity: "100",
        validFrom: "",
        validTo: "",
        validDays: "",
    }
}

/**
 * datetime-local 的本地墙钟（"2026-01-01T10:00"）→ 带时区的 ISO 时刻。
 * 本地解析是刻意的：卖家填的是自己时区的"10 点"，不是 UTC 的 10 点。
 */
function localDateTimeToIso(value: string): string | undefined {
    const ms = Date.parse(value)
    if (Number.isNaN(ms)) return undefined
    return new Date(ms).toISOString()
}

/** 两型各投影自己那一半；另一型的格发缺省（后端 + DB CHECK 都按「缺省即不适用」判） */
function faceValueFromForm(
    values: CouponFormValues,
): Pick<CreateCouponTemplateRequest, "discountAmount" | "discountRate" | "maxDiscountAmount"> {
    if (values.type === "DISCOUNT") {
        const discountRate = Number(values.discountRate)
        if (Number.isNaN(discountRate)) throw new Error("折扣率格式不正确")
        const maxDiscountAmount = yuanToMoney(values.maxDiscountYuan)
        if (maxDiscountAmount === undefined || !isPositiveMoney(maxDiscountAmount))
            throw new Error("最高减免金额格式不正确")
        return { discountRate, maxDiscountAmount }
    }
    const discountAmount = yuanToMoney(values.discountYuan)
    if (discountAmount === undefined || !isPositiveMoney(discountAmount))
        throw new Error("面额格式不正确")
    return { discountAmount }
}

/** 表单形状 → 后端请求：元转 Money（币种取平台定价币种）、本地时间转 ISO 时刻、文本 trim */
export function couponRequestFromForm(values: CouponFormValues): CreateCouponTemplateRequest {
    const thresholdAmount = yuanToMoney(values.thresholdYuan)
    if (thresholdAmount === undefined) throw new Error("门槛金额格式不正确")

    const totalQuantity = Number(values.totalQuantity)
    if (!Number.isInteger(totalQuantity) || totalQuantity < 1) {
        throw new Error("发放总量必须是大于等于 1 的整数")
    }

    const validFrom = localDateTimeToIso(values.validFrom)
    const validTo = localDateTimeToIso(values.validTo)
    if (!validFrom || !validTo) throw new Error("有效期格式不正确")

    const validDays = values.validDays.trim() === "" ? undefined : Number(values.validDays)

    return {
        name: values.name.trim(),
        type: values.type,
        thresholdAmount,
        totalQuantity,
        validFrom,
        validTo,
        validDays,
        ...faceValueFromForm(values),
    }
}
