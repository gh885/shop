/**
 * product —— 商品领域文件夹（扁形态：纯逻辑 + 数据层 + 组件内聚，无 entities/features/widgets 三层）。
 * - product.ts       ：纯类型 + 纯规则 + wire → 投影（toProduct/toSku/toProductDetail），不碰 React/网络
 * - use-product.ts   ：数据层（fetchProducts / fetchProductDetail 纯异步函数；真正 hook 在页面级 use-*）
 * - ProductCard.tsx  ：商品卡（卡片流/推荐/类目/搜索共用）
 *
 * 桶文件只暴露外部真正消费的那几个；模块内部一律相对路径直连，不走这里。
 */

export {
    derivePriceView,
    deriveStockText,
    findMatchingSku,
    isImageSpecGroup,
    isSelectionComplete,
    isValueAvailable,
    specValueImage,
} from "./product"
export type { Product, ProductDetail, SkuSelection } from "./product"

/** 共享值对象类型（Money / ParamItem / SpecItem）契约在 @shop/api，这里转发省得业务方跨包取 */

export type { ParamItem } from "@shop/api/sdk"

export { fetchProductDetail, fetchProducts } from "./use-product"

export { ProductCard } from "./ProductCard"
export type { ProductCardData } from "./ProductCard"
