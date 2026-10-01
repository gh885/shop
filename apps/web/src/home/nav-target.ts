import type { NavEntryResponse } from "@shop/api/sdk"

import type { SearchParams } from "#/search"

/**
 * 首页分类导航到搜索页的纯映射。
 *
 * 规则：
 * - 显式 SEARCH / CATEGORY 目标优先；
 * - 无子组、无目标的叶子词条，按文档默认把标题作为关键词；
 * - 不支持的目标类型不伪造跳转。
 */
export function searchParamsForNavEntry(entry: NavEntryResponse): SearchParams | undefined {
    const target = entry.target?.trim()
    if (entry.targetType === "SEARCH" && target) return { q: target }
    if (entry.targetType === "CATEGORY" && target) return { categoryId: target }
    if (!entry.targetType && !entry.target && entry.subs.length === 0) return { q: entry.title }
    return undefined
}

/** 组内叶子词条：字符串即预设搜索关键词。 */
export function searchParamsForNavItem(item: string): SearchParams {
    return { q: item.trim() }
}
