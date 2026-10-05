import type { FavoriteItemView } from "@shop/api/sdk"

import type { FavoriteItem } from "./favorite"

/** favorite/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。 */

/** 收藏条目投影：商品下架 → available=false 由渲染层置灰保留。
 * price 取最低价（卡片只展示一个价）。 */
export function toFavoriteItem(dto: FavoriteItemView): FavoriteItem {
    const p = dto.product
    return {
        id: dto.id,
        productId: dto.productId,
        favoritedAt: dto.favoritedAt,
        available: dto.available,
        title: p?.name ?? "",
        deleted: p === null,
        image: p?.mainImage ?? undefined,
        price: p?.minPrice ?? undefined,
        collectCount: p?.collectCount ?? 0,
    }
}
