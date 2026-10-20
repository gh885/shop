import type { FavoriteItemView } from "@shop/api/sdk"

import type { FavoriteItem } from "./rules"

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
