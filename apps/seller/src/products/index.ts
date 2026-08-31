/**
 * products —— 卖家商品域文件夹（扁形态，同 apps/web/src/cart）：
 * - category.ts     ：纯逻辑（树 → 搜索语料 / 级联列 / 路径推导），不碰 React/网络
 * - use-category.ts ：React 接线（类目树 query + 语料 memo）
 * - Category*.tsx   ：组件（发布第一步「选类目」的页签 / 搜索 / 级联三列）
 *
 * 桶文件只暴露外部真正消费的那几个；域内一律相对路径直连，不走这里。
 */

export { CategoryStep } from "./CategoryStep"
export { useCategoryTree } from "./use-category"
