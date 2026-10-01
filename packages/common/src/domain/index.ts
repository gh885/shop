/**
 * domain —— 业务字段口径：「这个数据怎么念、这个表单怎么限」的换算、文案与上限。
 * 纯逻辑，不碰 React / 网络 / UI；每条口径的后端对端在 Java 的 FieldRules 一族，
 * 「一个概念一个出口」由 src/shared-vocabulary.test.ts（前端侧）与 FieldRuleVocabularyTest（跨语言侧）钉住。
 * 包的准入标准与切片地图见 packages/common/README.md。
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
