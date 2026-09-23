/**
 * @shop/common —— 契约之上、UI 之下的共享逻辑层。
 *
 * 放进来的标准：被 ≥2 个 app 使用 + **不依赖任何 UI 包**（ui-web/app-kit）+ 不含端级
 * 业务规则。依赖方向：common → @shop/api（生成 SDK，唯一被依赖方），不得反向。
 *
 * 与相邻包的分工：
 * - @shop/api   ：生成 SDK（openapi-ts 产物），包内除聚合入口外一律是生成物；
 * - @shop/common：本包。手写共享逻辑 —— 金额 / 错误形状 / 表单 schema / auth / 传输装配 / 类目树算法；
 * - @shop/ui-web：纯 UI 组件，不知道契约；
 * - @shop/app-kit：同时消费 common 与 ui-web 的展示胶水（notify 文案策略、时间格式）。
 *
 * 模块索引：
 * - money.ts     ：金额 re-export（契约 Money）+ 分/元换算与区间展示
 * - api-error.ts ：后端统一错误形状 ApiError + 归一化（含 zod 契约校验语义）
 * - error-codes.ts：错误码常量（与 docs/error-codes.md 同步）
 * - sdk-client.ts：生成 SDK 的传输层装配（token 注入 / 401 刷新 / 错误归一化）
 * - auth-kit.ts  ：应用无关的登录态套件（内存 token + 静默刷新 + 设备 ID + 订阅）
 * - regions.ts   ：国标行政区划树的纯算法 + 数据（级联取孩子 / 6 位码反查路径）
 * - address.ts   ：地址字段口径（号码/区划码/详址）+ 省市区名按码派生，两端地址表单共用
 * - status-options.ts：状态表 → 页签/下拉选项（同一状态的中文只写一遍）
 * - coupon.ts    ：优惠券文案与规则换算（门槛/面额一句话、原因码与状态标签）
 */

export { statusOptions, type StatusOption } from "./status-options"

export {
    compareMoney,
    fenToYuan,
    formatMoney,
    isPositiveMoney,
    maxMoney,
    minMoney,
    money,
    moneyToYuan,
    type Money,
    priceRangeText,
    sameMoney,
    splitMoney,
    strikethroughPrice,
    sumMoney,
    timesMoney,
    yuanToFen,
    yuanToMoney,
    zeroMoney,
} from "./money"

export {
    ApiErrorSchema,
    type ApiError,
    RESPONSE_VALIDATION_FAILED,
    isZodError,
    toApiError,
    zodIssuesText,
} from "./api-error"

export * from "./error-codes"

export { configureSdkClient } from "./sdk-client"
export type { SdkClientOptions, TokenStore } from "./sdk-client"

export { createAuthKit } from "./auth-kit"
export type { AuthKit, AuthKitOptions, AuthStatus } from "./auth-kit"

export { findPath, loadChildren, loadRegionTree } from "./regions"
export type { RegionOption, RegionTreeNode } from "./regions"

export {
    ADDRESS_DETAIL_MAX,
    ADDRESS_NAME_MAX,
    AddressDetailSchema,
    AddressPhoneSchema,
    AddressRegionCodeSchema,
    regionNamesByCode,
    type RegionNames,
} from "./address"

export {
    COUPON_SOURCE_LABEL,
    COUPON_STATUS_LABEL,
    couponRuleText,
    couponSourceLabel,
    couponStatusLabel,
    couponThresholdText,
    couponMoneyText,
    couponUnavailableReasonText,
    couponYuanText,
} from "./coupon"
