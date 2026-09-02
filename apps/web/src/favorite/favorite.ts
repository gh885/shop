import type { FavoriteListItemResponse, Money } from "@shop/api/sdk"

/**
 * favorite 模块 —— 纯逻辑（投影映射 + 过滤 + 文案），不碰 React / 网络。
 * 这不是「收藏的业务规则」（后端裁决），而是 wire→投影 + 复用的小派生。
 */

/** 收藏条目投影：图片 undefined 归一空串；商品被删 → 全空兜底并置灰。
 * price 取最低价（卡片只展示一个价）；available=false（下架）由渲染层置灰保留。 */
export type FavoriteItem = {
    /** 收藏行主键（批量删除/跳转按 productId 而非该 id） */
    id: string
    productId: string
    favoritedAt: string
    available: boolean
    title: string
    image: string
    price: Money | undefined
    collectCount: number
}

/** wire → 投影（name→title、mainImage→image、minPrice→price；商品被删全空兜底） */
export function toFavoriteItem(dto: FavoriteListItemResponse): FavoriteItem {
    return {
        id: dto.id ?? "",
        productId: dto.productId ?? "",
        favoritedAt: dto.favoritedAt ?? "",
        available: dto.available ?? true,
        title: dto.product?.name ?? "商品已失效",
        image: dto.product?.mainImage ?? "",
        price: dto.product?.minPrice ?? undefined,
        collectCount: dto.product?.collectCount ?? 0,
    }
}

/** 关键词过滤：后端列表暂无搜索参数，前端过滤当前加载的条目 */
export function filterFavorites(favorites: FavoriteItem[], keyword: string): FavoriteItem[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return favorites
    return favorites.filter((f) => f.title.toLowerCase().includes(kw))
}

/** 人数展示：>=10000 转「x.x万」，>=1000 转「x.x千」，否则原样。与截图「1000+人收藏」对齐 */
export function collectText(count: number): string {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万人收藏`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}千人收藏`
    return `${count}人收藏`
}
