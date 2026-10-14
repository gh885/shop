/**
 * contract —— 与后端契约的手写接线层：契约本体（类型/路径）住在 @shop/api 生成 SDK，
 * 这里只有必须与契约同步的那半：统一错误形状（api-error）、码表词表
 * （error-codes / client-failure / validation-rules / permission-codes，服务端码由 contracts/error-codes.yaml 生成，
 * 四边一致性由 ErrorCodeVocabularyTest 与 error-keys 拦）。
 *
 * 全是纯常量与纯函数，没有运行时依赖，也没有模块级状态——带状态的那半（sdk-client 的拦截器装配、
 * auth-kit 的登录态）在 `@shop/client`。
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
