import type { RecommendTabRequest, RecommendTabResponse } from "@shop/api/sdk"
import { z } from "zod"

import {
    CMS_TAB_NAME_MAX,
    CmsTargetSortSchema,
    targetSortDefaults,
    toTargetSortFields,
} from "../constants"

export const TabFormSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, "请输入词条名")
            .max(CMS_TAB_NAME_MAX, `词条名最长 ${CMS_TAB_NAME_MAX} 字`),
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

/** 响应行 → 编辑请求体（取消其他默认项时全量覆写用） */
export function tabRowToRequest(tab: RecommendTabResponse): RecommendTabRequest {
    return {
        name: tab.name,
        targetType: tab.targetType ?? undefined,
        target: tab.target ?? undefined,
        isDefault: tab.isDefault,
        sortOrder: tab.sortOrder,
    }
}
