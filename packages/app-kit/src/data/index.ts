/**
 * data —— 服务端状态接线的公共部分（三端同一形态、只差装配参数）：
 * createAppQueryClient 是 QueryClient 默认值的唯一构造口（读侧 throwOnError + 写侧全局反馈），
 * notify / MutationMeta 声明面与全局 MutationCache 执行侧、optimisticListMutationOptions 配方、
 * createMeQuery（key / 新鲜度 / enabled 三端统一）、QueryBoundary、分页（search schema + PaginationBar）。
 * 反馈与失效的约定条文在 frontend.md「写操作」。
 */
export { notify, bindNotifyI18n } from "./notify"
export { PaginationBar } from "./pagination-bar"
export { createPaginationSearchSchema, paginationSearchSchema } from "./pagination-search"
export { createAppQueryClient } from "./query-client"
export { QueryBoundary } from "./query-boundary"
export { createMeQuery } from "./me-query"
export type { MutationMeta } from "./mutation-meta"
export type { ToastText } from "./toast-text"
export { resolveToastText } from "./toast-text"
export { optimisticListMutationOptions } from "./optimistic-list"
