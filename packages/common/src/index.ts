/**
 * @shop/common —— 契约之上、UI 之下的共享逻辑层。
 *
 * 放进来的标准：被 ≥2 个 app 使用 + **不依赖任何 UI 包**（ui-web/app-kit）+ 不含端级
 * 业务规则。例外是「口径类」逻辑（脱敏形状 mask.ts、大数折位 count.ts）：它们即使
 * 暂时只有一个 app 在调也该进来——收口本身就是理由，「一个概念只许有一个出口」由
 * shared-vocabulary.test.ts 钉住，第二个调用点出现时不需要重新决定住哪。
 * 依赖方向：common → @shop/api（生成 SDK，唯一被依赖方），不得反向。
 *
 * 与相邻包的分工：
 * - @shop/api   ：生成 SDK（openapi-ts 产物），包内除聚合入口外一律是生成物；
 * - @shop/common：本包。手写共享逻辑 —— 金额 / 错误形状 / 表单 schema / auth / 传输装配 / 类目树算法；
 * - @shop/ui-web：纯 UI 组件，不知道契约；
 * - @shop/app-kit：同时消费 common 与 ui-web 的展示胶水（notify 文案策略、时间格式）。
 *
 * 模块索引：
 * - money.ts     ：金额 re-export（契约 Money）+ 分/元换算与区间展示
 * - api-error.ts ：后端统一错误形状 ApiError + 归一化（含 zod 契约校验语义）+ 展示文案口径 apiErrorDetail
 * - error-codes.ts：错误码常量（与 docs/error-codes.md 同步）
 * - sdk-client.ts：生成 SDK 的传输层装配（token 注入 / 401 刷新 / 错误归一化）
 * - auth-kit.ts  ：应用无关的登录态套件（内存 token + 静默刷新 + 设备 ID + 订阅）
 * - regions.ts   ：国标行政区划树的纯算法 + 数据（级联取孩子 / 6 位码反查路径）
 * - scroll.ts    ：程序化滚动的取值口径（reduced-motion 下不 smooth），两端「回顶部/跳锚点」共用
 * - address.ts   ：地址字段口径（号码/区划码/详址）+ 省市区名按码派生，两端地址表单共用
 * - status-options.ts：状态表 → 页签/下拉选项（同一状态的中文只写一遍）
 * - coupon.ts    ：优惠券文案与规则换算（门槛/面额一句话、原因码与状态标签）+ 建券表单的券名上限
 * - note-fields.ts：「一段说明」的字数口径（买家留言/售后理由/拒绝理由/地址备注共用一份，镜像后端 NoteFieldRules）
 * - mask.ts      ：脱敏形状的唯一前端出口（号码掩码段与 maskPhone）
 * - count.ts     ：计数折万（销量/收藏数共用的「这个大数怎么念」）
 * - tracking.ts  ：运单字段口径（承运商展示名 / 运单号上限），发货与回寄两份表单共用
 * - product-fields.ts：商品字段口径（标题上限与卖点 10~30 及两句提示语、规格取值数与取值文本上限），卖家端各处表单共用一份
 * - shared-vocabulary.test.ts：前端共享词表门禁（一个概念一个出口，扫全仓源码）
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
    apiErrorDetail,
    RESPONSE_VALIDATION_FAILED,
    isZodError,
    toApiError,
    zodIssuesText,
} from "./api-error"

export * from "./error-codes"
export * from "./permission-codes"

export { configureSdkClient } from "./sdk-client"
export type { SdkClientOptions, TokenStore } from "./sdk-client"

export { createAuthKit, createSdkAuthKit } from "./auth-kit"
export type { AuthKit, AuthKitOptions, AuthStatus } from "./auth-kit"

export { findPath, loadChildren, loadRegionCascaderTree, loadRegionTree } from "./regions"
export type { RegionCascaderNode, RegionOption, RegionTreeNode } from "./regions"

export { scrollToElement, scrollToTop } from "./scroll"

export {
    ADDRESS_DETAIL_MAX,
    ADDRESS_LABEL_MAX,
    ADDRESS_NAME_MAX,
    ADDRESS_PARSE_TEXT_MAX,
    AddressDetailSchema,
    AddressPhoneSchema,
    AddressRegionCodeSchema,
    COMPANY_NAME_MAX,
    CONTACT_PHONE_MAX,
    CONTACT_PHONE_PATTERN,
    foldRegion,
    POSTAL_CODE_MAX,
    regionNamesByCode,
    type RegionNames,
} from "./address"

export { NOTE_MAX } from "./note-fields"

export {
    COUPON_NAME_MAX,
    COUPON_NAME_MESSAGE,
    COUPON_SOURCE_LABEL,
    COUPON_STATUS_META,
    USER_COUPON_STATUSES,
    couponFaceRuleText,
    couponFaceText,
    couponRuleText,
    couponSourceLabel,
    couponStatusMeta,
    couponStatusLabel,
    couponThresholdText,
    couponMoneyText,
    couponUnavailableReasonText,
    couponYuanText,
    type CouponFace,
    type UserCouponStatus,
} from "./coupon"

export { MASK_SEGMENT, maskPhone } from "./mask"

export { compactCount } from "./count"

export { CARRIER_NAME_MAX, TRACKING_NO_MAX, TrackingNoSchema } from "./tracking"

export {
    PRODUCT_NAME_MAX,
    PRODUCT_NAME_MESSAGE,
    SELL_POINT_MAX,
    SELL_POINT_MESSAGE,
    SELL_POINT_MIN,
    SPEC_VALUE_MAX,
    SPEC_VALUES_MAX,
    ProductNameSchema,
    SellPointSchema,
} from "./product-fields"
export * from "./i18n"
