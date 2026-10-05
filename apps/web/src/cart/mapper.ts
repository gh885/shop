import type { CartItemView as ApiCartItemView } from "@shop/api/sdk"

import type { CartItem } from "./cart"

/** cart/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。 */

/**
 * 轻量映射：只做组件真正需要的两个重命名（wire name/mainImage → 域 title/image）
 * 与 available 默认 true，其余字段原样透传。不做逐字段造假兜底（`?? ""` 一律避免）。
 */
export function toCartItem(dto: ApiCartItemView): CartItem {
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
