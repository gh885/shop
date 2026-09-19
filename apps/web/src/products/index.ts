/**
 * products —— 商品领域文件夹（扁形态：纯逻辑 + 数据层 + 组件内聚；详情页组件在 detail/ 子目录）。
 * - product.ts          ：纯类型 + 纯规则 + wire → 投影（toProduct/toProductDetail），不碰 React/网络
 * - detail/queries.ts   ：数据层（fetchProducts / fetchProductDetail 纯异步函数 + 页面级 queryOptions）
 * - ProductCard.tsx     ：商品卡（卡片流/推荐/类目/搜索共用）
 * - detail/             ：商品详情页（路由 /products/$id）的组屏与页级查询
 *
 * 桶文件只暴露外部真正消费的那几个；模块内部一律相对路径直连，不走这里。
 */

export { toProductCardData } from "./product"
export type { ProductDetail } from "./product"

export { fetchProducts } from "./detail/queries"

export { ProductCard } from "./ProductCard"
