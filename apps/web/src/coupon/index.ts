/**
 * coupon —— 买家优惠券域（扁形态：逻辑 + 数据 hook + 组件平铺）。
 * - coupon.ts             ：业务类型 + wire→投影（toMyCoupon）+ 页签定义 + 按状态分组（可领券直接用 SDK 类型）
 * - queries.ts            ：券包查询 / 领券 mutation / 店铺可领券查询
 * - CouponCard.tsx        ：券包里的一张券（三行信息 + 状态/来源标签）
 * - ShopCouponPopover.tsx ：商品详情页店铺条的领券入口浮层
 *
 * 文案（规则一句话 / 状态 / 来源 / 原因码）一律来自 `@shop/common` 的 coupon.ts，
 * 本域不重复实现 —— 结算选券、卖家券列表用的是同一套说法。
 */

export {
    COUPON_PAGE_SIZE,
    COUPON_TABS,
    groupByStatus,
    isCouponAlreadyClaimed,
    toMyCoupon,
} from "./coupon"
export type { CouponGroup, CouponTab, MyCoupon } from "./coupon"

export {
    MY_COUPONS_KEY,
    SHOP_CLAIMABLE_COUPONS_KEY,
    useClaimCoupon,
    useMyCoupons,
    useShopClaimableCoupons,
} from "./queries"

export { CouponCard } from "./CouponCard"
export { ShopCouponPopover } from "./ShopCouponPopover"
