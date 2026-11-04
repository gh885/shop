export * from "./locale"
export * from "./message"
export * from "./message-fact"
export * from "./timezone"

// 共享词典装配与运行时：共享 catalog 由本包持有（src/locales），各端只接自己的 resources
export { assembleLocaleResources } from "./resources"
export { SHARED_MESSAGES, translateShared } from "./messages"
export { createAppI18n } from "./runtime"
export { sharedMessage } from "./shared-message"

// 错误码 → 共享文案的纯函数桥接（渲染边界的 glue，依赖 @shop/common/contract 的码词表）
export {
    CODE_SLOTS,
    errorText,
    errorTextPlan,
    type ErrorTextPlan,
    type ErrorTextSource,
} from "./error-keys"
export { fieldErrorFact, validationRuleOf, type FieldErrorFact } from "./field-error-fact"
export { localizeStatusOptions } from "./localize-options"

// 共享词典的类型面：各端生成物里 `XTranslate` 与其联合推导的导入源
export type {
    SharedCatalog,
    SharedMessageKey,
    SharedNamespace,
    SharedParamsByKey,
    SharedParamsOf,
    SharedScopedT,
    SharedTranslate,
} from "./locales/messages.gen"
