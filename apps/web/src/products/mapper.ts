import type {
    FeedItemResponse,
    PublicProductDetailResponse,
    PublicProductResponse,
} from "@shop/api/sdk"

import type { Product, ProductDetail } from "./product"

export function toProduct(dto: PublicProductResponse | FeedItemResponse): Product {
    return {
        id: dto.id,
        shopId: dto.shopId,
        categoryId: dto.categoryId,
        title: dto.name,
        subtitle: dto.subtitle,
        image: dto.mainImage,
        priceMin: dto.minPrice,
        priceMax: dto.maxPrice,
        soldCount: dto.soldCount,
    }
}

export function toProductDetail(dto: PublicProductDetailResponse): ProductDetail {
    return {
        product: toProduct(dto.product),
        sevenDayReturn: dto.product.sevenDayReturn,
        detailImages: dto.detailImages,
        images: dto.images,
        specs: dto.specs,
        params: dto.params,
        skus: dto.skus,
    }
}
