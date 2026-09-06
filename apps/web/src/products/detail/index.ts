/**
 * detail —— 商品详情页（路由 /products/$id）的组屏与页级查询。
 * - DetailSection(s).tsx / Gallery.tsx / PurchasePanel.tsx / ShopBar.tsx / RecommendSections.tsx：分区组屏
 * - queries.ts            ：商品详情 / 店铺 / 推荐流的 queryOptions
 * - use-sku-selection.ts  ：SKU 选择状态机
 *
 * 域内消费一律相对路径直连（../product），外部经上级桶文件进。
 */

export { DetailHeader } from "./DetailHeader"
export { DetailSections } from "./DetailSections"
export { Gallery } from "./Gallery"
export { PurchaseCta } from "./PurchaseCta"
export { PurchasePanel } from "./PurchasePanel"
export { ShopBar } from "./ShopBar"
export { ShopRecommendSection, AlsoViewedSection } from "./RecommendSections"

export { productDetailOptions, shopOptions } from "./queries"
export { useSkuSelection } from "./use-sku-selection"
