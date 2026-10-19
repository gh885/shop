import { BannerRequestSchema, NavRequestSchema, RecommendTabRequestSchema } from "@shop/api/schemas"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import { CmsStatus } from "@shop/api/sdk"

import type { AdminMessageKey } from "#/locales/messages.gen"

/** 槽位：本域纯数据表（契约 maxLength、跳转类型、状态徽章词表）。zod 契约在 form.ts（三表单共享片段）与各子页 form.ts，出文案的函数在 display.ts */

export const CMS_TITLE_MAX = NavRequestSchema.properties.title.maxLength
export const CMS_SUBTITLE_MAX = BannerRequestSchema.properties.subtitle.maxLength
export const CMS_TAB_NAME_MAX = RecommendTabRequestSchema.properties.name.maxLength

// 定位码与词条名同为 32 是两个概念，别按数字并成一个常量
export const CMS_KEY_MAX = NavRequestSchema.properties.navKey.maxLength

export const CMS_SUB_GROUPS_MAX = NavRequestSchema.properties.subs.maxItems

export const CMS_TARGET_MAX = NavRequestSchema.properties.target.maxLength

export const CMS_URL_MAX = BannerRequestSchema.properties.imageUrl.maxLength

export const TARGET_TYPES = ["PRODUCT", "CATEGORY", "CAMPAIGN", "SEARCH", "URL"] as const
export type TargetType = (typeof TARGET_TYPES)[number]

type TargetTypeKey = Extract<AdminMessageKey, `cms.targetType.${string}`>

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

export const CMS_NAV_KEYS = ["home"] as const
export const CMS_BANNER_SLOTS = ["home_promo"] as const

type CmsStatusKey = Extract<AdminMessageKey, `cms.status.${string}`>

export const STATUS_BADGE: Record<
    CmsStatus,
    { labelKey: CmsStatusKey; variant: "success" | "secondary" }
> = {
    ENABLED: { labelKey: "cms.status.ENABLED", variant: "success" },
    DISABLED: { labelKey: "cms.status.DISABLED", variant: "secondary" },
}
