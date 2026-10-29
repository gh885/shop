import type { Money } from "@shop/api/sdk"

import { EMPTY_SELECTION } from "./constants"

/** 本域业务规则出口：收藏列表的过滤与多选判定。常量在 constants.ts，展示函数在 display.ts */

export type FavoriteItem = {
    id: string
    spuId: string
    favoritedAt: string
    available: boolean
    title: string
    image: string
    price: Money
}

export function filterFavorites(favorites: FavoriteItem[], keyword: string): FavoriteItem[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return favorites
    return favorites.filter((f) => f.title.toLowerCase().includes(kw))
}

export function toggleSelection(selected: ReadonlySet<string>, spuId: string): ReadonlySet<string> {
    const next = new Set(selected)
    if (!next.delete(spuId)) next.add(spuId)
    return next
}

export function dropSelection(selected: ReadonlySet<string>, spuId: string): ReadonlySet<string> {
    if (!selected.has(spuId)) return selected
    return toggleSelection(selected, spuId)
}

export function pickAllSelection(
    items: readonly { spuId: string }[],
    checked: boolean,
): ReadonlySet<string> {
    return checked ? new Set(items.map((f) => f.spuId)) : EMPTY_SELECTION
}
