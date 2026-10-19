import type { ClaimableCouponResponse, MyCouponResponse } from "@shop/api/sdk"
import { USER_COUPON_STATUSES } from "@shop/common/domain"
import { ErrorCodes, toApiError } from "@shop/common/contract"

/** 本域业务规则唯一出口（rules 槽位）：判定与不依赖语言的推导——不收 locale、不出文案、不带 UI 外观。展示词表在 constants.ts，查表出文案/页签/灰字的函数在 display.ts，wire→视图在 mapper.ts */

export type MyCoupon = Omit<MyCouponResponse, "orderId"> & {
    orderId?: string
}

export type ClaimableCoupon = ClaimableCouponResponse

export type CouponTab = "UNUSED" | "USED" | "EXPIRED"

export const COUPON_PAGE_SIZE = 10

export type CouponGroup = { status: string; coupons: MyCoupon[] }

const STATUS_ORDER: readonly string[] = USER_COUPON_STATUSES

function statusRank(status: string): number {
    const index = STATUS_ORDER.indexOf(status)
    return index === -1 ? STATUS_ORDER.length : index
}

export function groupByStatus(coupons: MyCoupon[]): CouponGroup[] {
    const groups = new Map<string, MyCoupon[]>()
    for (const coupon of coupons) {
        const list = groups.get(coupon.status)
        if (list) list.push(coupon)
        else groups.set(coupon.status, [coupon])
    }
    return [...groups.entries()]
        .toSorted(([a], [b]) => statusRank(a) - statusRank(b))
        .map(([status, list]) => ({ status, coupons: list }))
}

export function isCouponAlreadyClaimed(err: unknown): boolean {
    const e = toApiError(err)
    return e.code === ErrorCodes.COUPON_ALREADY_CLAIMED
}
