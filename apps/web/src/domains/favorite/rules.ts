import type { Money } from "@shop/api/sdk"

import { EMPTY_SELECTION } from "./constants"

/** 本域业务规则出口：收藏列表的过滤与多选判定。常量在 constants.ts，展示函数在 display.ts */

export type FavoriteItem = {
    id: string
    productId: string
    favoritedAt: string
    available: boolean
    title: string
    deleted: boolean
    image?: string
    price?: Money
    collectCount: number
}

export function filterFavorites(favorites: FavoriteItem[], keyword: string): FavoriteItem[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return favorites
    return favorites.filter((f) => f.title.toLowerCase().includes(kw))
}

export function toggleSelection(
    selected: ReadonlySet<string>,
    productId: string,
): ReadonlySet<string> {
    const next = new Set(selected)
    if (!next.delete(productId)) next.add(productId)
    return next
}

export function dropSelection(
    selected: ReadonlySet<string>,
    productId: string,
): ReadonlySet<string> {
    if (!selected.has(productId)) return selected
    return toggleSelection(selected, productId)
}

export function pickAllSelection(
    items: readonly { productId: string }[],
    checked: boolean,
): ReadonlySet<string> {
    return checked ? new Set(items.map((f) => f.productId)) : EMPTY_SELECTION
}
