import type { CartLine } from "@shop/api/sdk"

import type { CartItem } from "./rules"

/** 契约 `CartLine` 没有独立行 id：skuId 就是键（同一 SKU 在车里只有一行） */
export function toCartItem(dto: CartLine): CartItem {
    return {
        ...dto,
        id: dto.skuId,
        skuId: dto.skuId,
        quantity: dto.quantity,
        selected: dto.selected,
        available: dto.available,
    }
}
