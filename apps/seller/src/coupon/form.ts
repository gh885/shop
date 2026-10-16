import { CreateCouponTemplateRequestSchema } from "@shop/api/schemas"
import { z } from "zod"

import { CouponType, type CreateCouponTemplateRequest } from "@shop/api/sdk"
import {
    COUPON_NAME_MAX,
    isPositiveMoney,
    statusOptionsFromKeys,
    withMaxLength,
    yuanToFen,
    yuanToMoney,
    type KeyedStatusOption,
} from "@shop/common/domain"

import { messageFactFactory, type MessageFact } from "@shop/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

// 元↔分、本地墙钟↔带时区 ISO 只在 couponRequestFromForm 一处换算；散到页面就会双重换算（金额 bug）
const COUPON_MAX_TOTAL = CreateCouponTemplateRequestSchema.properties.totalQuantity.maximum

type CouponTypeKey = Extract<SellerMessageKey, `coupon.type.${string}`>

const COUPON_TYPE_KEYS = {
    FULL_REDUCTION: "coupon.type.FULL_REDUCTION",
    DISCOUNT: "coupon.type.DISCOUNT",
} as const satisfies Record<CouponType, CouponTypeKey>

export const COUPON_TYPE_ITEMS: ReadonlyArray<KeyedStatusOption<CouponType, CouponTypeKey>> =
    statusOptionsFromKeys(COUPON_TYPE_KEYS)

// 与后端 CouponFieldRules 和库上 CHECK 同值：改一端不同步另一端，坏值会到落库才炸
export const VALID_DAYS_MIN = CreateCouponTemplateRequestSchema.properties.validDays.minimum
export const VALID_DAYS_MAX = CreateCouponTemplateRequestSchema.properties.validDays.maximum

// 消息只发结构化事实（key+params），句子由渲染边界按 locale 换出；带数字的条款走 refine——.max() 通道会丢 params
type CouponErrKey = Extract<SellerMessageKey, `coupon.form.err.${string}`>
const err = messageFactFactory<CouponErrKey, SellerParamsByKey>()

const yuanField = (required: MessageFact<CouponErrKey>, format: MessageFact<CouponErrKey>) =>
    z
        .string()
        .trim()
        .min(1, required)
        .refine((value) => yuanToFen(value) !== undefined, format)

// 跨字段条款读的是原始字符串（金额/时间还没换算），不是校验后的数值
type CouponTermsShape = {
    type: CouponType
    thresholdYuan: string
    discountYuan: string
    discountRate: string
    maxDiscountYuan: string
    validDays: string
    validFrom: string
    validTo: string
}

function refineDiscountTerms(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    const rate = Number(value.discountRate)
    if (!value.discountRate || Number.isNaN(rate) || rate <= 0 || rate >= 1) {
        ctx.addIssue({
            code: "custom",
            path: ["discountRate"],
            ...err("coupon.form.err.rateRange"),
        })
    }
    const cap = yuanToFen(value.maxDiscountYuan)
    if (value.maxDiscountYuan.trim() === "") {
        ctx.addIssue({
            code: "custom",
            path: ["maxDiscountYuan"],
            ...err("coupon.form.err.maxDiscountRequired"),
        })
    } else if (cap === undefined || cap <= 0) {
        ctx.addIssue({
            code: "custom",
            path: ["maxDiscountYuan"],
            ...err("coupon.form.err.maxDiscountFormat"),
        })
    }
}

function refineReductionTerms(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    const threshold = yuanToFen(value.thresholdYuan)
    const discount = yuanToFen(value.discountYuan)
    if (value.discountYuan.trim() === "") {
        ctx.addIssue({
            code: "custom",
            path: ["discountYuan"],
            ...err("coupon.form.err.discountRequired"),
        })
    } else if (discount === undefined || discount <= 0) {
        ctx.addIssue({
            code: "custom",
            path: ["discountYuan"],
            ...err("coupon.form.err.discountPositive"),
        })
    }
    // 门槛 0 = 无门槛，不是缺填：去掉 !== 0 守卫会把无门槛券的合理面额误拦
    if (
        threshold !== undefined &&
        threshold !== 0 &&
        discount !== undefined &&
        discount > threshold
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["discountYuan"],
            ...err("coupon.form.err.discountOverThreshold"),
        })
    }
}

function refineValidDays(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    if (value.validDays.trim() === "") return
    const days = Number(value.validDays)
    if (!Number.isInteger(days) || days < VALID_DAYS_MIN || days > VALID_DAYS_MAX) {
        ctx.addIssue({
            code: "custom",
            path: ["validDays"],
            ...err("coupon.form.err.validDaysRange", {
                min: VALID_DAYS_MIN,
                max: VALID_DAYS_MAX,
            }),
        })
    }
}

function refineValidWindow(value: CouponTermsShape, ctx: z.RefinementCtx): void {
    if (!value.validFrom || !value.validTo) return
    const from = Date.parse(value.validFrom)
    const to = Date.parse(value.validTo)
    if (!Number.isNaN(from) && !Number.isNaN(to) && to <= from) {
        ctx.addIssue({
            code: "custom",
            path: ["validTo"],
            ...err("coupon.form.err.windowOrder"),
        })
    }
}

export const CouponFormSchema = z
    .object({
        name: withMaxLength(
            z.string().trim().min(1, err("coupon.form.err.nameRequired")),
            COUPON_NAME_MAX,
            err("coupon.form.err.nameMax", { max: COUPON_NAME_MAX }),
        ),
        type: z.enum(CouponType),
        thresholdYuan: yuanField(
            err("coupon.form.err.thresholdRequired"),
            err("coupon.form.err.thresholdFormat"),
        ),
        discountYuan: z.string().trim(),
        discountRate: z.string().trim(),
        maxDiscountYuan: z.string().trim(),
        totalQuantity: z
            .string()
            .trim()
            .min(1, err("coupon.form.err.totalRequired"))
            .refine((value) => {
                const quantity = Number(value)
                return Number.isInteger(quantity) && quantity >= 1
            }, err("coupon.form.err.totalInt"))
            .refine(
                (value) => Number(value) <= COUPON_MAX_TOTAL,
                err("coupon.form.err.totalMax", { max: COUPON_MAX_TOTAL }),
            ),
        validFrom: z.string().trim().min(1, err("coupon.form.err.windowFromRequired")),
        validTo: z.string().trim().min(1, err("coupon.form.err.windowToRequired")),
        validDays: z.string().trim(),
    })
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

export function emptyCouponForm(): CouponFormValues {
    return {
        name: "",
        type: CouponType.FULL_REDUCTION,
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

// 券时间窗按本地时区解析：卖家填的是自己时区的"10 点"，改成 UTC 会差一个时区
function localDateTimeToIso(value: string): string | undefined {
    const ms = Date.parse(value)
    if (Number.isNaN(ms)) return undefined
    return new Date(ms).toISOString()
}

// 两型各发自己那一半、另一型发缺省：改成两格都发会被后端按「不适用」判掉，也可能撞 DB CHECK
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
