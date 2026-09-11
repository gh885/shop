/**
 * app-kit —— 三个 SPA（web / seller / admin）共享的「应用层胶水」。
 *
 * 职责边界（这是它存在的原因）：同时消费 @shop/common（契约形状/错误语义）与
 * @shop/ui-web（UI）的那部分约定——notify 的错误文案策略、时间展示格式、登录表单交互、
 * 图片 URL 拼装策略等——既不属于纯 UI 包，也不属于 @shop/common（它不含展示决策），
 * 又实在没必要在每个 app 里复制一份。
 *
 * 放进来的标准：被 ≥2 个 app 使用 + 依赖两个底层包 + 不含端级业务规则
 * （端级业务规则仍归各 app，领域 hook 如 useMe 因接线不同保留在各 app）。
 */

export { notify } from "./notify"
export { formatDate, formatDateTime, formatTimeShort } from "./format"
export { LoginForm } from "./login-form"
export type { LoginFormProps, LoginTab } from "./login-form"
export { createImgUrl } from "./image"
