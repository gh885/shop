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

/**
 * subs = JSONB 整段的组/项两级配置（上限全部来自 `../constants`，与后端 CmsFieldRules 同值由门禁核对）。
 *
 * 分组数那一格用 `refine` 而不是数组的 `.max()`：Zod 4.6 的 check 通道会把 `params` 丢掉，
 * 句子「最多 {max} 个分组」的槽位就填不上（`withMaxLength` 的注释记了同一条实测）。
 */
export const SubsSchema = z
    .array(
        z.object({
            name: withMaxLength(
                z.string().trim().min(1, cmsErr("admin.cms.form.err.groupNameRequired")),
                CMS_TITLE_MAX,
            ),
            items: z.array(withMaxLength(z.string().trim(), CMS_TITLE_MAX)).optional(),
        }),
    )
    .refine(
        (subs) => subs.length <= CMS_SUB_GROUPS_MAX,
        cmsErr("admin.cms.form.err.subsLimit", { max: CMS_SUB_GROUPS_MAX }),
    )

export type SubsGroup = z.infer<typeof SubsSchema>[number]
export type SubsValue = SubsGroup[]

/**
 * 响应里的 subs → 编辑器状态（{@link toNavRequest} 的反向）：契约里 `items` 是缺省，
 * 编辑器要把它铺成「零行草稿」，否则运营看不到「这组还没填词条」，也就无从填起。
 */
export function normalizeSubs(subs?: NavEntryResponse["subs"]): SubsValue {
    return (subs ?? []).map((group) => ({ name: group.name, items: group.items ?? [] }))
}

export const NavFormSchema = z
    .object({
        navKey: withMaxLength(
            z.string().trim().min(1, cmsErr("admin.cms.form.err.navKeyRequired")),
            CMS_KEY_MAX,
        ),
        title: withMaxLength(
            z.string().trim().min(1, cmsErr("admin.cms.form.err.titleRequired")),
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

/** 表单值 + subs 编辑器状态 → NavRequest（subs 提交前需过 SubsSchema 校验） */
export function toNavRequest(v: NavFormValues, subs: SubsValue): NavRequest {
    return {
        navKey: v.navKey.trim(),
        title: v.title.trim(),
        iconKey: blank(v.iconKey),
        ...toTargetSortFields(v),
        // 空词条在提交时剔除；整组无词条发缺省而不是 null（前端契约：items 缺省 = 无词条）
        subs: subs.map((g) => {
            const items = g.items?.filter((i) => i.trim()) ?? []
            return items.length > 0 ? { name: g.name.trim(), items } : { name: g.name.trim() }
        }),
    }
}
