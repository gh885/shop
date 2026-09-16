/**
 * detail —— 商品详情页（路由 /products/$id）的组屏与页级查询。
 * - DetailHeader / ShopBar / Gallery / PurchasePanel / PurchaseCta / DetailSections：分区组屏
 *   （`DetailSection` 区块壳与推荐流区块在 DetailSections.tsx 内；区块的三态在各自 States/Skeleton 里）
 * - constants.ts          ：版式表与数量上限（DETAIL_LAYOUT / PDP_MAX_QUANTITY）
 * - queries.ts            ：商品详情 / 店铺 / 推荐流的 queryOptions
 * - sku-search.ts         ：URL 里的规格选择（schema + 收窄 + 切换）
 * - use-sku-selection.ts  ：规格选择状态机（读 URL → 派生 → 上报变更意图）
 *
 * 域内消费一律相对路径直连（../product），外部经上级桶文件进。
 */

export { DetailHeader } from "./DetailHeader"
export { DETAIL_LAYOUT, PDP_MAX_QUANTITY } from "./constants"
export { DetailSections, ShopRecommendSection, AlsoViewedSection } from "./DetailSections"
export { Gallery } from "./Gallery"
export { ProductDetailSkeleton } from "./ProductDetailSkeleton"
export { PurchaseCta } from "./PurchaseCta"
export { PurchasePanel } from "./PurchasePanel"
export { ShopBar } from "./ShopBar"

export { productDetailOptions, shopOptions } from "./queries"
export { skuSearchSchema, type SkuSearch, type SkuSearchInput } from "./sku-search"
export { useSkuSelection } from "./use-sku-selection"
