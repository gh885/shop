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
 * - PaginationBar：列表分页条（页码算法 + ui-web 原语渲染，页码存哪由调用方决定）
 *
 * 账号侧表单格式规则（手机号形状/位数、验证码位数、密码下限）的 owner 也在本包
 * （`login-schema.ts`）：登录框在这里，而邀请成员、注销确认这些入口复用同一条规则。
 */

export { WorkbenchSidebar } from "./workbench/sidebar"
export { WorkbenchTopBar, WorkbenchTopBarAction, WorkbenchAccount } from "./workbench/topbar"
export { activeSectionOf } from "./workbench/navigation"
export type { SidebarItem } from "./workbench/navigation"

export { notify } from "./notify"
export { copyWithNotify } from "./copy-text"
export { formatDate, formatDateTime, formatTimeShort } from "./format"
export { TimeText } from "./time-text"
export { PaginationBar } from "./pagination-bar"
export { createPaginationSearchSchema, paginationSearchSchema } from "./pagination-search"
export { LoginForm } from "./login-form"
export {
    CAPTCHA_CODE_DIGITS,
    NICKNAME_MAX,
    PHONE_DIGITS,
    PHONE_PATTERN,
    PASSWORD_MIN,
    PhoneSchema,
    SMS_CODE_DIGITS,
    SmsCodeSchema,
} from "./login-schema"
// 发码之后的交互规则（重发窗口多长、哪些错误算「码本身错了」）：登录框与注销、邀请共用同一判据
export { isCodeError, isSmsRateLimit, RESEND_COUNTDOWN_SECONDS } from "./login-ui"
export { FormActions } from "./form-actions"
export { ReasonForm } from "./reason-form"
export { RegionField } from "./region-field"
export { regionCascaderTreeOptions } from "./region-query"
export { createImgUrl } from "./image"
export { createAppQueryClient } from "./query-client"
export { mountSpa } from "./spa-entry"
export { trackRouteResolved } from "./route-tracking"
export { QueryBoundary } from "./query-boundary"
export { useUnsavedLeaveGuard } from "./use-unsaved-leave"
export { useCountdown } from "./use-countdown"
export { usePasswordVisibility } from "./use-password-visibility"
export { RouteErrorFallback } from "./route-error-fallback"
export { createMeQuery } from "./me-query"
export type { MutationMeta } from "./mutation-meta"
export { optimisticListMutationOptions } from "./optimistic-list"
export * from "./i18n"
export { translateSidebarItems, type SidebarI18nKeys } from "./workbench/navigation"
