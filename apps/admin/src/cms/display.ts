import type { NavGroup } from "@shop/api/sdk"
import { formatTimeShort } from "@shop/app-kit"

/**
 * CMS 列表单元格里那句「给人看的话」：从行数据折出文案的规则都收在这里，常量表（`./constants`）
 * 只留词表与颜色档。规则与数据混在一个文件里，下一个加列的人就分不清哪一半可以拿到 node 环境测。
 */

/** 生效窗口：双空 = 立即上线、长期有效 */
export function bannerWindowText(startAt: string | null, endAt: string | null): string {
    if (!startAt && !endAt) return "立即 · 长期"
    const from = startAt ? formatTimeShort(startAt) : "立即"
    const to = endAt ? formatTimeShort(endAt) : "长期"
    return `${from} ~ ${to}`
}

/** 分组与词条的规模（`n 组 / m 项`）：subs 是整段 JSONB，列表只报规模不铺开 */
export function subsSummary(subs: readonly NavGroup[]): string {
    const itemCount = subs.reduce((sum, group) => sum + (group.items?.length ?? 0), 0)
    return `${subs.length} 组 / ${itemCount} 项`
}
