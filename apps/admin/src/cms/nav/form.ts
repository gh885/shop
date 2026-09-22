import type { NavRequest, NavEntryResponse } from "@shop/api/sdk"
import { z } from "zod"

import { blankToUndefined as blank, parseTargetType, TargetTypeSchema } from "../constants"

/** subs = JSONB 整段的组/项两级配置（对齐后端 NavGroup 校验：组名 ≤64、词条 ≤64、≤30 组） */
export const SubsSchema = z
    .array(
        z.object({
            name: z.string().trim().min(1, "分组名不能为空").max(64),
            items: z.array(z.string().trim().max(64, "词条最长 64 字")).optional(),
        }),
    )
    .max(30, "分组上限 30 个")

export type SubsGroup = z.infer<typeof SubsSchema>[number]
export type SubsValue = SubsGroup[]

export const NavFormSchema = z.object({
    navKey: z.string().trim().min(1, "请输入导航位").max(32),
    title: z.string().trim().min(1, "请输入标题").max(64),
    iconKey: z.string().trim().max(32).optional(),
    targetType: TargetTypeSchema.or(z.literal("NONE")).optional(),
    target: z.string().trim().max(255).optional(),
    sortOrder: z.string().trim().regex(/^\d*$/, "排序需为非负整数"),
})

export type NavFormValues = z.infer<typeof NavFormSchema>

export function navDefaults(entry?: NavEntryResponse, navKey?: string): NavFormValues {
    return {
        navKey: entry?.navKey ?? navKey ?? "",
        title: entry?.title ?? "",
        iconKey: entry?.iconKey ?? "",
        targetType: parseTargetType(entry?.targetType),
        target: entry?.target ?? "",
        sortOrder: String(entry?.sortOrder ?? 0),
    }
}

/** 表单值 + subs 编辑器状态 → NavRequest（subs 提交前需过 SubsSchema 校验） */
export function toNavRequest(v: NavFormValues, subs: SubsValue): NavRequest {
    return {
        navKey: v.navKey.trim(),
        title: v.title.trim(),
        iconKey: blank(v.iconKey),
        targetType: v.targetType === "NONE" ? undefined : v.targetType,
        target: blank(v.target),
        sortOrder: v.sortOrder ? Number(v.sortOrder) : 0,
        // 空词条在提交时剔除；整组无词条发缺省而不是 null（前端契约：items 缺省 = 无词条）
        subs: subs.map((g) => {
            const items = g.items?.filter((i) => i.trim()) ?? []
            return items.length > 0 ? { name: g.name.trim(), items } : { name: g.name.trim() }
        }),
    }
}
