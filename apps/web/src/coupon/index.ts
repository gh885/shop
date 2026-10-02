/**
 * coupon —— 买家优惠券域（扁形态：逻辑 + 数据 hook + 组件平铺）。
 * - coupon.ts             ：业务类型 + wire→投影（toMyCoupon / toClaimableCoupon）+ 页签定义 + 按状态分组
 * - queries.ts            ：券包查询 / 领券 mutation / 店铺可领券查询
 * - CouponCard.tsx        ：券包里的一张券（三行信息 + 状态/来源标签）
 * - ShopCouponPopover.tsx ：商品详情页店铺条的领券入口浮层
 *
 * 文案（规则一句话 / 状态 / 来源 / 原因码）一律来自 `@shop/common` 的 coupon.ts，
 * 本域不重复实现 —— 结算选券、卖家券列表用的是同一套说法。
 */

export { COUPON_PAGE_SIZE, COUPON_TABS, groupByStatus } from "./coupon"
export type { CouponTab } from "./coupon"

/**
 * 事实 → 句子（结算选券区也要出券的规则句，所以走 barrel 而不是直插文件——跨域只走 index.ts）。
 * `couponFaceText` 不在这里：本域内两个组件（CouponCard / ShopCouponPopover）直接引文件即可，
 * 挂上 barrel 只会多一个没人用的导出（`pnpm fallow` 判死代码）。
 */
export { couponRuleText } from "./coupon-rule"

export { myCouponsOptions, MY_COUPONS_KEY } from "./queries"

export { CouponCard } from "./CouponCard"
export { ShopCouponPopover } from "./ShopCouponPopover"
