import type { UserCouponStatus } from "@shop/common/domain"
import type { WebMessageKey } from "#/locales/messages.gen"

import type { CouponTab } from "./rules"

/** 本域展示词表（纯数据，constants 槽位）：状态/来源/不可用原因 → 文案 key 与徽章外观，外加页签顺序数组。查表出文案/形状的函数在 display.ts，判定逻辑在 rules.ts（rules 槽位），wire→视图在 mapper.ts */

/** 券列表每页条数：分页口径只有这一处，queries 与页脚共用 */
export const COUPON_PAGE_SIZE = 10

export type BuyerBadgeVariant = "success" | "warning" | "secondary" | "outline"

export type CouponStatusKey = Extract<WebMessageKey, `coupon.status.${string}`>

export type CouponSourceKey = Extract<WebMessageKey, `coupon.source.${string}`>

export type CouponUnavailableReasonKey = Extract<WebMessageKey, `coupon.unavailable.${string}`>

export const COUPON_STATUS_META: Record<
    UserCouponStatus,
    { labelKey: CouponStatusKey; variant: BuyerBadgeVariant }
> = {
    UNUSED: { labelKey: "coupon.status.UNUSED", variant: "success" },
    LOCKED: { labelKey: "coupon.status.LOCKED", variant: "warning" },
    USED: { labelKey: "coupon.status.USED", variant: "secondary" },
    EXPIRED: { labelKey: "coupon.status.EXPIRED", variant: "outline" },
    VOID: { labelKey: "coupon.status.VOID", variant: "outline" },
}

/** 域内查表用：状态码 → {labelKey, variant}，未知码由 display.ts 的 couponStatusMeta 兜成 outline */
export const COUPON_STATUS_BY_KEY: Record<
    string,
    { labelKey: CouponStatusKey; variant: BuyerBadgeVariant } | undefined
> = COUPON_STATUS_META

export const COUPON_SOURCE_META: Record<string, CouponSourceKey | undefined> = {
    CLAIM: "coupon.source.CLAIM",
    REFUND_RETURN: "coupon.source.REFUND_RETURN",
}

export const COUPON_UNAVAILABLE_REASON_META: Record<
    string,
    CouponUnavailableReasonKey | undefined
> = {
    NOT_EFFECTIVE: "coupon.unavailable.NOT_EFFECTIVE",
    EXPIRED: "coupon.unavailable.EXPIRED",
    THRESHOLD_NOT_MET: "coupon.unavailable.THRESHOLD_NOT_MET",
    CURRENCY_MISMATCH: "coupon.unavailable.CURRENCY_MISMATCH",
}

/** 页签顺序（纯数据）：display.ts 用它 + COUPON_STATUS_META 派生 COUPON_TABS，改顺序只改这一行 */
export const COUPON_TAB_ORDER: readonly CouponTab[] = ["UNUSED", "USED", "EXPIRED"]
