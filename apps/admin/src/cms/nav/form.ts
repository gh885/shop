import type { NavRequest, NavEntryResponse } from "@shop/api/sdk"
import { withMaxLength } from "@shop/common/domain"
import { z } from "zod"

import {
    blankToUndefined as blank,
    cmsErr,
    CMS_KEY_MAX,
    CMS_SUB_GROUPS_MAX,
    CMS_TITLE_MAX,
    CmsTargetSortSchema,
    targetSortDefaults,
    toTargetSortFields,
} from "../constants"

// 分组数用 refine 不用数组 .max()：Zod 4.6 的 check 通道会丢 params，「最多 {max} 个分组」填不上
export const SubsSchema = z
    .array(
        z.object({
            name: withMaxLength(
                z.string().trim().min(1, cmsErr("cms.form.err.groupNameRequired")),
                CMS_TITLE_MAX,
            ),
            items: z.array(withMaxLength(z.string().trim(), CMS_TITLE_MAX)).optional(),
        }),
    )
    .refine(
        (subs) => subs.length <= CMS_SUB_GROUPS_MAX,
        cmsErr("cms.form.err.subsLimit", { max: CMS_SUB_GROUPS_MAX }),
    )

export type SubsGroup = z.infer<typeof SubsSchema>[number]
export type SubsValue = SubsGroup[]

export function normalizeSubs(subs?: NavEntryResponse["subs"]): SubsValue {
    return (subs ?? []).map((group) => ({ name: group.name, items: group.items ?? [] }))
}

export const NavFormSchema = z
    .object({
        navKey: withMaxLength(
            z.string().trim().min(1, cmsErr("cms.form.err.navKeyRequired")),
            CMS_KEY_MAX,
        ),
        title: withMaxLength(
            z.string().trim().min(1, cmsErr("cms.form.err.titleRequired")),
            CMS_TITLE_MAX,
        ),
        iconKey: withMaxLength(z.string().trim(), CMS_KEY_MAX).optional(),
    })
    .merge(CmsTargetSortSchema)

export type NavFormValues = z.infer<typeof NavFormSchema>

export function navDefaults(entry?: NavEntryResponse, navKey?: string): NavFormValues {
    return {
        navKey: entry?.navKey ?? navKey ?? "",
        title: entry?.title ?? "",
        iconKey: entry?.iconKey ?? "",
        ...targetSortDefaults(entry),
    }
}

export function toNavRequest(v: NavFormValues, subs: SubsValue): NavRequest {
    return {
        navKey: v.navKey.trim(),
        title: v.title.trim(),
        iconKey: blank(v.iconKey),
        ...toTargetSortFields(v),
        // 剔空词条；整组无词条发「没有 items」而非 items: null（前端契约：缺省 = 无词条）
        subs: subs.map((g) => {
            const items = g.items?.filter((i) => i.trim()) ?? []
            return items.length > 0 ? { name: g.name.trim(), items } : { name: g.name.trim() }
        }),
    }
}
