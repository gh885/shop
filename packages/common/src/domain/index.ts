/**
 * domain —— 业务字段口径：「这个数据怎么念、这个表单怎么限」的换算、文案与上限。
 * 纯逻辑，不碰 React / 网络 / UI；每条口径的后端对端在 Java 的 FieldRules 一族，
 * 「一个概念一个出口」由 src/shared-vocabulary.test.ts（前端侧）与 FieldRuleVocabularyTest（跨语言侧）钉住。
 * 包的准入标准与切片地图见 packages/common/README.md。
 */
export { statusOptionsFromKeys, type StatusOption, type KeyedStatusOption } from "./status-options"
export {
    fenToYuan,
    formatMoney,
    isPositiveMoney,
    money,
    moneyToYuan,
    type Money,
    splitMoney,
    sumMoney,
    timesMoney,
    yuanToFen,
    yuanToMoney,
    zeroMoney,
} from "./money"
export { CARRIER_LABELS, carrierLabel } from "./carriers"
export { findPath, loadRegionCascaderTree, loadRegionTree } from "./regions"
export type { RegionCascaderNode, RegionOption, RegionTreeNode } from "./regions"
export { scrollToElement, scrollToTop } from "./scroll"
export {
    ADDRESS_DETAIL_MAX,
    ADDRESS_LABEL_MAX,
    ADDRESS_NAME_MAX,
    ADDRESS_PARSE_TEXT_MAX,
    AddressDetailSchema,
    AddressPhoneSchema,
    CONTACT_PHONE_MAX,
    CONTACT_PHONE_PATTERN,
    foldRegion,
    regionCodeSchema,
    REGION_CODE_PATTERN,
    regionNamesByCode,
    type RegionNames,
} from "./address"
export { NOTE_MAX } from "./note-fields"
export { USER_COUPON_STATUSES, type UserCouponStatus } from "./coupon"
export { MASK_SEGMENT } from "./mask"
export { withMaxLength, withMinLength, type FieldRuleIssue } from "./length-rules"
export { CARRIER_NAME_MAX, TRACKING_NO_MAX, TrackingNoSchema } from "./tracking"
export { PRODUCT_NAME_MAX, SELL_POINT_MAX, ProductNameSchema } from "./product-fields"
