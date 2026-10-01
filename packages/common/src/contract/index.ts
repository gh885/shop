/**
 * contract —— 与后端契约的手写接线层：契约本体（类型/路径）住在 @shop/api 生成 SDK，
 * 这里只有必须与契约同步的那半：统一错误形状（api-error）、码表词表
 * （error-codes / client-failure / validation-rules / permission-codes，真相源 docs/error-codes.md，
 * 四边一致性由 ErrorCodeVocabularyTest 与 error-keys 拦）、传输装配（sdk-client：token 注入 /
 * 401 刷新 / 错误归一化）与应用无关的登录态套件（auth-kit）。
 */
export * from "./error-codes"
export * from "./client-failure"
export * from "./validation-rules"
export * from "./permission-codes"

export {
    type ApiFieldError,
    ApiErrorSchema,
    type ApiError,
    type ApiParams,
    fieldErrorsOf,
    isApiError,
    paramsOf,
    isZodError,
    toApiError,
    zodIssuesText,
} from "./api-error"
export { configureSdkClient } from "./sdk-client"
export type { SdkClientOptions, TokenStore } from "./sdk-client"
export { createAuthKit, createSdkAuthKit } from "./auth-kit"
export type { AuthKit, AuthKitOptions, AuthStatus } from "./auth-kit"
