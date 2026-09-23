import { z } from "zod"

import type { CreateCouponTemplateRequest } from "@shop/api/sdk"
import { isPositiveMoney, yuanToFen, yuanToMoney } from "@shop/common"

/**
 * coupon 域 · 表单层：Zod 校验 + 表单形状 → 后端请求的投影。
 *
 * 单位口径是这一层唯一要操心的事：用户在表单里填「元」，契约要「分」；
 * 表单里是 datetime-local 的本地墙钟字符串，契约要带时区的 ISO 时刻。
 * 两处换算都只在这里发生一次，页面组件不碰金额与时间。
 */

const COUPON_MAX_TOTAL = 1_000_000

const yuanField = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `请输入${label}`)
        .refine((value) => yuanToFen(value) !== undefined, `${label}格式不正确`)

export const CouponFormSchema = z
    .object({
        name: z.string().trim().min(1, "请输入券名").max(60, "券名最多 60 字"),
        /** 使用门槛（元）：0 = 无门槛 */
        thresholdYuan: yuanField("门槛金额"),
        /** 减免额（元） */
        discountYuan: yuanField("面额").refine(
            (value) => (yuanToFen(value) ?? 0) > 0,
            "面额必须大于 0",
        ),
        totalQuantity: z
            .string()
            .trim()
            .min(1, "请输入发放总量")
            .refine((value) => {
                const quantity = Number(value)
                return Number.isInteger(quantity) && quantity >= 1
            }, "发放总量必须是大于等于 1 的整数")
            .refine(
                (value) => Number(value) <= COUPON_MAX_TOTAL,
                `发放总量最多 ${COUPON_MAX_TOTAL}`,
            ),
        validFrom: z.string().trim().min(1, "请选择有效期起点"),
        validTo: z.string().trim().min(1, "请选择有效期终点"),
    })
    // 跨字段条款：后端也会挡（且是 400），但等一趟网络再报错不如在提交前说清楚
    .superRefine((value, ctx) => {
        const threshold = yuanToFen(value.thresholdYuan)
        const discount = yuanToFen(value.discountYuan)
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
                message: "面额不能超过使用门槛，请检查是否填反",
            })
        }

        if (value.validFrom && value.validTo) {
            const from = Date.parse(value.validFrom)
            const to = Date.parse(value.validTo)
            if (!Number.isNaN(from) && !Number.isNaN(to) && to <= from) {
                ctx.addIssue({
                    code: "custom",
                    path: ["validTo"],
                    message: "有效期终点必须晚于起点",
                })
            }
        }
    })

export type CouponFormValues = z.infer<typeof CouponFormSchema>

/** 新建表单的初始值：空字符串 + 一个合理的默认量，避免用户从 0 开始调 */
export function emptyCouponForm(): CouponFormValues {
    return {
        name: "",
        thresholdYuan: "0",
        discountYuan: "",
        totalQuantity: "100",
        validFrom: "",
        validTo: "",
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

/** 表单形状 → 后端请求：元转 Money（币种取平台定价币种）、本地时间转 ISO 时刻、文本 trim */
export function couponRequestFromForm(values: CouponFormValues): CreateCouponTemplateRequest {
    const thresholdAmount = yuanToMoney(values.thresholdYuan)
    if (thresholdAmount === undefined) throw new Error("门槛金额格式不正确")

    const discountAmount = yuanToMoney(values.discountYuan)
    if (discountAmount === undefined || !isPositiveMoney(discountAmount))
        throw new Error("面额格式不正确")

    const totalQuantity = Number(values.totalQuantity)
    if (!Number.isInteger(totalQuantity) || totalQuantity < 1) {
        throw new Error("发放总量必须是大于等于 1 的整数")
    }

    const validFrom = localDateTimeToIso(values.validFrom)
    const validTo = localDateTimeToIso(values.validTo)
    if (!validFrom || !validTo) throw new Error("有效期格式不正确")

    return {
        name: values.name.trim(),
        thresholdAmount,
        discountAmount,
        totalQuantity,
        validFrom,
        validTo,
    }
}
