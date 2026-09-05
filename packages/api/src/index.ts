export { configureSdkClient } from "./sdk-client"
export type { SdkClientOptions } from "./sdk-client"

export { createAuthKit } from "./auth-kit"
export type { AuthKit, AuthKitOptions, AuthStatus } from "./auth-kit"

export { fenToYuan, priceRangeText, splitFen, yuanToFen } from "./money"

export type { Money } from "./common"
export { MoneySchema } from "./common"
export type { ApiError } from "./common"
export {
    toApiError,
    isContractViolation,
    isZodError,
    zodIssuesText,
    RESPONSE_VALIDATION_FAILED,
} from "./api-error"
export * from "./error-codes"
export * from "./forms"
// 生成 SDK 自带的 zod schema（zMoney、zXxxResponse 等，随 pnpm gen:sdk 同步）：
// 供表单 schema 推导、unknown 数据守卫复用；勿直接 import 生成文件内部路径
export * from "./sdk/zod.gen"
