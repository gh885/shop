import { withMaxLength } from "@shop/common/domain"
import { z } from "zod"

import { messageFactFactory } from "@shop/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

import { CMS_TARGET_MAX, TARGET_TYPES, type TargetType } from "./constants"

/** 槽位：三张子页表单共用的 zod 契约（target+排序片段、校验消息工厂 cmsErr、往返函数）。子页契约在 banner|nav|recommend-tab/form.ts，纯数据词表在 constants.ts */

type CmsFormErrKey = Extract<AdminMessageKey, `cms.form.err.${string}`>

export const cmsErr = messageFactFactory<CmsFormErrKey, AdminParamsByKey>()

const TargetTypeSchema = z.enum(TARGET_TYPES)
const TargetTypeFieldSchema = TargetTypeSchema.or(z.literal("NONE"))

export function parseTargetType(value?: string | null): TargetType | "NONE" {
    const parsed = TargetTypeFieldSchema.safeParse(value)
    return parsed.success ? parsed.data : "NONE"
}

// 契约不认 NONE（只收五种）：折成缺省，别原样发出去
function submitTargetType(value?: TargetType | "NONE"): TargetType | undefined {
    return value && value !== "NONE" ? value : undefined
}

export const CmsTargetSortSchema = z.object({
    targetType: TargetTypeSchema.or(z.literal("NONE")).optional(),
    target: withMaxLength(z.string().trim(), CMS_TARGET_MAX).optional(),
    sortOrder: z.string().trim().regex(/^\d*$/, cmsErr("cms.form.err.sortOrderInt")),
})

export type CmsTargetSortValues = z.infer<typeof CmsTargetSortSchema>

type CmsTargetSortRow = {
    target?: string | null
    targetType?: string | null
    sortOrder?: number
}

export function targetSortDefaults(row?: CmsTargetSortRow): CmsTargetSortValues {
    return {
        targetType: parseTargetType(row?.targetType),
        target: row?.target ?? "",
        sortOrder: String(row?.sortOrder ?? 0),
    }
}

export function toTargetSortFields(values: CmsTargetSortValues) {
    return {
        targetType: submitTargetType(values.targetType),
        target: blankToUndefined(values.target),
        sortOrder: values.sortOrder ? Number(values.sortOrder) : 0,
    }
}

export const blankToUndefined = (s?: string) => s?.trim() || undefined
