/**
 * products —— 卖家商品域文件夹（扁形态，同 apps/web/src/cart）：
 * - category.ts     ：纯逻辑（树 → 搜索语料 / 级联列 / 路径推导），不碰 React/网络
 * - use-category.ts ：React 接线（类目树 query + 语料 memo）
 * - Category*.tsx   ：发布第一步「选类目」的组件（页签 / 搜索 / 级联三列）
 * - Publish*.tsx    ：发布第二步「填商品信息」的组屏（锚点页签 / 分区卡片 / 底部操作条）
 *
 * 桶文件只暴露外部真正消费的那几个；域内一律相对路径直连，不走这里。
 */

export type { ProductStatusFilter } from "./constants"
export { FilterBar, DEFAULT_FILTER, type ProductListFilter } from "./list/filter"
export { ProductTable } from "./list/table"
export { CategoryStep } from "./create/category/CategoryStep"
export {
    BasicStep as PublishBasicStep,
    type BasicStepValues,
    type SubmitMode,
} from "./create/basic/BasicStep"
export type { ListingTime } from "./create/basic/product-form-state"
export { useCategoryTree } from "./use-category"
