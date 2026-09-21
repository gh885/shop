/**
 * app-kit —— 三个 SPA（web / seller / admin）共享的「应用层胶水」。
 *
 * 职责边界（这是它存在的原因）：同时消费 @shop/common（契约形状/错误语义）与
 * @shop/ui-web（UI）的那部分约定——notify 的错误文案策略、时间展示格式、登录表单交互、
 * 图片 URL 拼装策略等——既不属于纯 UI 包，也不属于 @shop/common（它不含展示决策），
 * 又实在没必要在每个 app 里复制一份。
 *
 * 放进来的标准：被 ≥2 个 app 使用 + 依赖两个底层包 + 不含端级业务规则
 * （端级业务规则仍归各 app；端级**装配参数**的差异由工厂参数吸收）。
 *
 * 服务端状态接线的公共部分也在这里（两者都是「三端同一形态、只差装配参数」）：
 * - createAppQueryClient：QueryClient 默认值的唯一构造口（读侧 throwOnError + 写侧全局反馈）
 * - createMeQuery：当前登录者查询（key / 新鲜度 / enabled 条件三端统一）
 * - MutationMeta / optimisticListMutationOptions：写操作的声明面与乐观更新配方
 */

export { WorkbenchSidebar } from "./workbench/sidebar"
export { WorkbenchTopBar, WorkbenchTopBarAction, WorkbenchAccount } from "./workbench/topbar"
export { activeSectionOf } from "./workbench/navigation"
export type { SidebarItem, SidebarGroup, SidebarLeaf } from "./workbench/navigation"

export { notify } from "./notify"
export { formatDate, formatDateTime, formatTimeShort } from "./format"
export { LoginForm } from "./login-form"
export type { LoginFormProps, LoginTab } from "./login-form"
export { createImgUrl } from "./image"
export { createAppQueryClient, throwWhenNoData } from "./query-client"
export type { AppQueryClientOverrides } from "./query-client"
export { QueryBoundary } from "./query-boundary"
export type { QueryBoundaryProps } from "./query-boundary"
export { RouteErrorFallback } from "./route-error-fallback"
export type { RouteErrorFallbackProps } from "./route-error-fallback"
export { createMeQuery } from "./me-query"
export type { MeQuery, MeQueryConfig } from "./me-query"
export type { MutationMeta } from "./mutation-meta"
export { optimisticListMutationOptions } from "./optimistic-list"
export type { OptimisticListMutationConfig } from "./optimistic-list"
