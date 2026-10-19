import type { CartItemView } from "@shop/api/sdk"

import type { CartItem } from "./cart"

export function toCartItem(dto: CartItemView): CartItem {
    return {
        id: dto.id,
        skuId: dto.skuId,
        quantity: dto.quantity,
        selected: dto.selected,
        available: dto.available,
        product:
            dto.product === null
                ? // oxlint-disable-next-line no-null -- 领域契约：product 可空（CartItemProduct | null，已删商品）
                  null
                : {
                      id: dto.product.id,
                      title: dto.product.name,
                      image: dto.product.mainImage ?? undefined,
                      shopId: dto.product.shopId,
                      shopName: dto.product.shopName,
                  },
        sku: dto.sku,
    }
}
