import type { NavGroup } from "@shop/api/sdk"
import type { AppLocale } from "@shop/common"
import { formatTimeShort } from "@shop/app-kit"

/**
 * CMS 列表单元格里那句「给人看的话」：从行数据折出文案的规则都收在这里，常量表（`./constants`）
 * 只留词表与颜色档。规则与数据混在一个文件里，下一个加列的人就分不清哪一半可以拿到 node 环境测。
 */

/**
 * 生效窗口：双空 = 立即上线、长期有效。
 *
 * `locale` 由调用方给（§3.5 约束 2）：这条规则要在 node 里脱离渲染被单测钉住，
 * 所以它不读任何上下文，纯函数进纯函数出。列定义里那一格渲染 `BannerWindowCell`，由它取语言。
 */
export function bannerWindowText(
    startAt: string | null,
    endAt: string | null,
    locale: AppLocale,
): string {
    if (!startAt && !endAt) return "立即 · 长期"
    const from = startAt ? formatTimeShort(startAt, locale) : "立即"
    const to = endAt ? formatTimeShort(endAt, locale) : "长期"
    return `${from} ~ ${to}`
}

/** 分组与词条的规模（`n 组 / m 项`）：subs 是整段 JSONB，列表只报规模不铺开 */
export function subsSummary(subs: readonly NavGroup[]): string {
    const itemCount = subs.reduce((sum, group) => sum + (group.items?.length ?? 0), 0)
    return `${subs.length} 组 / ${itemCount} 项`
}
