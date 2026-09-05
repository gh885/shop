/**
 * cart —— 购物车领域文件夹（扁形态：纯逻辑 + hook + 组件内聚，无 entities/features/widgets 三层）。
 * - cart.ts      ：纯逻辑（投影映射 / 派生 / 缓存变换 / UX 守卫），不碰 React/网络
 * - use-cart.ts  ：React 接线（query + mutation）
 * - Cart*.tsx    ：组件（读 useCartItems / 纯派生 / 调 mutation，几乎无逻辑）
 *
 * 桶文件只暴露外部真正消费的那几个；模块内部一律相对路径直连，不走这里。
 */

export { groupByShop } from "./cart"
export { useAddToCart, useCartCount, useCartItems } from "./queries"

export { Settlement } from "./Settlement"
export { ShopGroupCard } from "./ShopGroupCard"
export { Toolbar } from "./Toolbar"
