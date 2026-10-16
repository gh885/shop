import type { NavEntryResponse } from "@shop/api/sdk"

import type { SearchParams } from "#/search"

export function searchParamsForNavEntry(entry: NavEntryResponse): SearchParams | undefined {
    const target = entry.target?.trim()
    if (entry.targetType === "SEARCH" && target) return { q: target }
    if (entry.targetType === "CATEGORY" && target) return { categoryId: target }
    if (!entry.targetType && !entry.target && entry.subs.length === 0) return { q: entry.title }
    return undefined
}

export function searchParamsForNavItem(item: string): SearchParams {
    return { q: item.trim() }
}
