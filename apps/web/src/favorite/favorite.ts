import type { FavoriteItemView, Money } from "@shop/api/sdk"
import { compactCount } from "@shop/common"

/**
 * favorite 模块 —— 纯逻辑（投影映射 + 过滤 + 文案），不碰 React / 网络。
 * 这不是「收藏的业务规则」（后端裁决），而是 wire→投影 + 复用的小派生。
 */

/** 收藏条目投影：商品下架 → available=false 由渲染层置灰保留。
 * price 取最低价（卡片只展示一个价）。 */
export type FavoriteItem = {
    /** 收藏行主键（批量删除/跳转按 productId 而非该 id） */
    id: string
    productId: string
    favoritedAt: string
    available: boolean
    title: string
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
    price?: Money
    collectCount: number
}

/** wire → 投影（name→title、mainImage→image、minPrice→price；商品被删时 product 为 null，给失效占位） */
export function toFavoriteItem(dto: FavoriteItemView): FavoriteItem {
    const p = dto.product
    return {
        id: dto.id,
        productId: dto.productId,
        favoritedAt: dto.favoritedAt,
        available: dto.available,
        title: p?.name ?? "商品已删除",
        image: p?.mainImage ?? undefined,
        price: p?.minPrice ?? undefined,
        collectCount: p?.collectCount ?? 0,
    }
}

/** 关键词过滤：后端列表暂无搜索参数，前端过滤当前加载的条目 */
export function filterFavorites(favorites: FavoriteItem[], keyword: string): FavoriteItem[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return favorites
    return favorites.filter((f) => f.title.toLowerCase().includes(kw))
}

/** 人数展示：折万口径与销量同一份（`compactCount`，PRD-68）——同一张卡片上「已售」和「收藏」不该各折各的 */
export function collectText(count: number): string {
    return `${compactCount(count)}人收藏`
}
