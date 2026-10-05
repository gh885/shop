import type {
    FeedItemResponse,
    PublicProductDetailResponse,
    PublicProductResponse,
} from "@shop/api/sdk"

import type { Product, ProductDetail } from "./product"

/**
 * products/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。
 *
 * 投影刻意做瘦：只暴露消费方真正需要的字段，wire 的可选字段归一成稳定缺省形状。
 * 金额一律 Money（分 + 币种），不裸传 number；后端已直接差分 Money 对象（币种含在 Money 里），投影直接透传。
 */

/**
 * wire → 业务形状：required 字段不再兜底；subtitle/mainImage 可空如实透传 null。
 *
 * 入参收 `PublicProductResponse | FeedItemResponse` 的联合：货架卡与列表项是同一张卡片的两个契约
 * （feed 自建出参，不复用列表的那个 record），字段同名同义，所以只留这一个投影，不写第二份。
 */
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

/** 详情 wire：detailImages/images/specs/params 在详情响应顶层（product 只是列表项）；SKU 形状与契约一致，原样透传 */
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
