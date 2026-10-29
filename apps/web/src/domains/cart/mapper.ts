import type { CartLine } from "@shop/api/sdk"

import type { CartItem } from "./rules"

/** 契约 `CartLine` 没有独立行 id：skuId 就是键（同一 SKU 在车里只有一行） */
export function toCartItem(dto: CartLine): CartItem {
    const skuId = dto.skuId ?? ""
    return {
        ...dto,
        id: skuId,
        skuId,
        quantity: dto.quantity ?? 0,
        selected: dto.selected ?? false,
        available: dto.available ?? false,
    }
}
