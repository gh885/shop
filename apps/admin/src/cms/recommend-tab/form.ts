import type { RecommendTabRequest, RecommendTabResponse } from "@shop/api/sdk"
import { z } from "zod"

import { blankToUndefined as blank, parseTargetType, TargetTypeSchema } from "../constants"

export const TabFormSchema = z.object({
    name: z.string().trim().min(1, "请输入词条名").max(32, "词条名最长 32 字"),
    targetType: TargetTypeSchema.or(z.literal("NONE")).optional(),
    target: z.string().trim().max(255).optional(),
    isDefault: z.boolean(),
    sortOrder: z.string().trim().regex(/^\d*$/, "排序需为非负整数"),
})

export type TabFormValues = z.infer<typeof TabFormSchema>

export function tabDefaults(tab?: RecommendTabResponse): TabFormValues {
    return {
        name: tab?.name ?? "",
        targetType: parseTargetType(tab?.targetType),
        target: tab?.target ?? "",
        isDefault: tab?.isDefault ?? false,
        sortOrder: String(tab?.sortOrder ?? 0),
    }
}

export function toTabRequest(v: TabFormValues): RecommendTabRequest {
    return {
        name: v.name.trim(),
        targetType: v.targetType === "NONE" ? undefined : v.targetType,
        target: blank(v.target),
        isDefault: v.isDefault,
        sortOrder: v.sortOrder ? Number(v.sortOrder) : 0,
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
