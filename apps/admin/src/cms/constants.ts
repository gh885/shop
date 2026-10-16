import { BannerRequestSchema, NavRequestSchema, RecommendTabRequestSchema } from "@shop/api/schemas"
import { statusOptionsFromKeys, withMaxLength, type KeyedStatusOption } from "@shop/common/domain"
import { CmsStatus } from "@shop/api/sdk"
import { z } from "zod"

import { messageFactFactory } from "@shop/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

export const CMS_TITLE_MAX = NavRequestSchema.properties.title.maxLength
export const CMS_SUBTITLE_MAX = BannerRequestSchema.properties.subtitle.maxLength
export const CMS_TAB_NAME_MAX = RecommendTabRequestSchema.properties.name.maxLength

// 定位码与词条名同为 32 是两个概念，别按数字并成一个常量
export const CMS_KEY_MAX = NavRequestSchema.properties.navKey.maxLength

export const CMS_SUB_GROUPS_MAX = NavRequestSchema.properties.subs.maxItems

export const CMS_TARGET_MAX = NavRequestSchema.properties.target.maxLength

export const CMS_URL_MAX = BannerRequestSchema.properties.imageUrl.maxLength

export const TARGET_TYPES = ["PRODUCT", "CATEGORY", "CAMPAIGN", "SEARCH", "URL"] as const
const TargetTypeSchema = z.enum(TARGET_TYPES)
export type TargetType = z.infer<typeof TargetTypeSchema>

type CmsFormErrKey = Extract<AdminMessageKey, `cms.form.err.${string}`>

export const cmsErr = messageFactFactory<CmsFormErrKey, AdminParamsByKey>()

const TargetTypeFieldSchema = TargetTypeSchema.or(z.literal("NONE"))
export function parseTargetType(value?: string | null): TargetType | "NONE" {
    const parsed = TargetTypeFieldSchema.safeParse(value)
    return parsed.success ? parsed.data : "NONE"
}

// 契约不认 NONE（只收五种）：折成缺省，别原样发出去
function submitTargetType(value?: TargetType | "NONE"): TargetType | undefined {
    return value && value !== "NONE" ? value : undefined
}

type TargetTypeKey = Extract<AdminMessageKey, `cms.targetType.${string}`>
type CmsStatusKey = Extract<AdminMessageKey, `cms.status.${string}`>

const TARGET_TYPE_KEYS: Record<TargetType, TargetTypeKey> = {
    PRODUCT: "cms.targetType.PRODUCT",
    CATEGORY: "cms.targetType.CATEGORY",
    CAMPAIGN: "cms.targetType.CAMPAIGN",
    SEARCH: "cms.targetType.SEARCH",
    URL: "cms.targetType.URL",
}

export const TARGET_TYPE_ITEMS: ReadonlyArray<
    KeyedStatusOption<TargetType | "NONE", TargetTypeKey>
> = [{ value: "NONE", labelKey: "cms.targetType.NONE" }, ...statusOptionsFromKeys(TARGET_TYPE_KEYS)]

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

export const CMS_NAV_KEYS = ["home"] as const
export const CMS_BANNER_SLOTS = ["home_promo"] as const

export const STATUS_BADGE: Record<
    CmsStatus,
    { labelKey: CmsStatusKey; variant: "success" | "secondary" }
> = {
    ENABLED: { labelKey: "cms.status.ENABLED", variant: "success" },
    DISABLED: { labelKey: "cms.status.DISABLED", variant: "secondary" },
}

// datetime-local ↔ ISO 的两个函数上移到 #/shared/lib/datetime 后原样再导出：调用点不用改 import
export { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"

export const blankToUndefined = (s?: string) => s?.trim() || undefined
