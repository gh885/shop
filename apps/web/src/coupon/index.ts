/**
 * coupon —— 买家优惠券域（扁形态：逻辑 + 数据 hook + 组件平铺）。
 * - coupon.ts             ：业务类型 + 页签定义 + 按状态分组
 * - mapper.ts             ：wire→投影（toMyCoupon / toClaimableCoupon）
 * - queries.ts            ：券包查询 / 领券 mutation / 店铺可领券查询
 * - CouponCard.tsx        ：券包里的一张券（三行信息 + 状态/来源标签）
 * - ShopCouponPopover.tsx ：商品详情页店铺条的领券入口浮层
 *
 * 规则的一句话事实（门槛/面额/折扣率）来自 `@shop/common`、句子在本域 `coupon-rule` 用 t() 拼；
 * 状态徽章与页签那句中文连同配色是本域自己那张买家视角表（`coupon.ts`，键进 catalog）——
 * 券包三处（卡片/页签/分组）读同一份，运营与卖家另有各自的视角表。
 */

export {
    COUPON_PAGE_SIZE,
    COUPON_TABS,
    couponStatusMeta,
    couponUnavailableReasonKey,
    groupByStatus,
} from "./coupon"
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
