/**
 * detail —— 商品详情页（路由 /products/$id）的组屏与页级查询。
 * - DetailSections.tsx / Gallery.tsx / PurchasePanel.tsx / ShopBar.tsx：分区组屏
 *   （DetailSection 区块壳与推荐流区块都在 DetailSections.tsx 内）
 * - queries.ts            ：商品详情 / 店铺 / 推荐流的 queryOptions
 * - use-sku-selection.ts  ：SKU 选择状态机
 *
 * 域内消费一律相对路径直连（../product），外部经上级桶文件进。
 */

export { DetailHeader, DETAIL_CONTAINER_CLASS } from "./DetailHeader"
export { DetailSections, ShopRecommendSection, AlsoViewedSection } from "./DetailSections"
export { Gallery } from "./Gallery"
export { PurchaseCta } from "./PurchaseCta"
export { PurchasePanel } from "./PurchasePanel"
export { ShopBar } from "./ShopBar"

export { productDetailOptions, shopOptions } from "./queries"
export { useSkuSelection } from "./use-sku-selection"
