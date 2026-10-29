import type { BuyerProductCard, ProductDetail as ProductDetailDto } from "@shop/api/sdk"

import { deriveSpecGroups } from "./rules"
import type { Product, ProductDetail } from "./rules"

export function toProduct(dto: BuyerProductCard): Product {
    return dto
}

export function toProductDetail(dto: ProductDetailDto): ProductDetail {
    return { ...dto, specGroups: deriveSpecGroups(dto.skus) }
}
