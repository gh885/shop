export {
    ProductSchema,
    ProductDetailSchema,
    SkuSchema,
    ProductSortSchema,
    ProductListQuerySchema,
    findMatchingSku,
    isValueAvailable,
    specValueImage,
    isImageSpecGroup,
    derivePriceView,
    deriveStockText,
    isSelectionComplete,
} from "./model"
export type {
    Product,
    ProductDetail,
    Sku,
    ProductSort,
    ProductListQueryInput,
    ProductListQuery,
    SkuSelection,
    PriceView,
} from "./model"

/** 共享值对象类型（Money / ParamItem / SpecItem）契约在 @shop/api，这里转发省得业务方跨包取 */
export type { Money, ParamItem, SpecItem } from "@shop/api"

export { ProductCard } from "./ProductCard"
export type { ProductCardData } from "./ProductCard"

export { fetchProducts, fetchProductDetail } from "./actions"
