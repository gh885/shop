import type { FavoriteLine } from "@shop/api/sdk"

import type { FavoriteItem } from "./rules"

export function toFavoriteItem(dto: FavoriteLine): FavoriteItem {
    return {
        id: dto.spuId,
        spuId: dto.spuId,
        favoritedAt: dto.favoritedAt,
        available: dto.available,
        title: dto.title,
        image: dto.imageUrl,
        price: dto.price,
    }
}
