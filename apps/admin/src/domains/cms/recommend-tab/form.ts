import type { RecommendTabRequest, RecommendTabResponse } from "@shop/api/sdk"
import { withMaxLength } from "@shop/common/domain"
import { z } from "zod"

import { CMS_TAB_NAME_MAX } from "../constants"
import { cmsErr, CmsTargetSortSchema, targetSortDefaults, toTargetSortFields } from "../form"

export const TabFormSchema = z
    .object({
        name: withMaxLength(
            z.string().trim().min(1, cmsErr("cms.form.err.tabNameRequired")),
            CMS_TAB_NAME_MAX,
        ),
        isDefault: z.boolean(),
    })
    .merge(CmsTargetSortSchema)

export type TabFormValues = z.infer<typeof TabFormSchema>

export function tabDefaults(tab?: RecommendTabResponse): TabFormValues {
    return {
        name: tab?.name ?? "",
        isDefault: tab?.isDefault ?? false,
        ...targetSortDefaults(tab),
    }
}

export function toTabRequest(v: TabFormValues): RecommendTabRequest {
    return {
        name: v.name.trim(),
        isDefault: v.isDefault,
        ...toTargetSortFields(v),
    }
}

export function tabRowToRequest(tab: RecommendTabResponse): RecommendTabRequest {
    return {
        name: tab.name,
        targetType: tab.targetType ?? undefined,
        target: tab.target ?? undefined,
        isDefault: tab.isDefault,
        sortOrder: tab.sortOrder,
    }
}
