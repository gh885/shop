import type { ClaimableCouponResponse, MyCouponResponse } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import {
    USER_COUPON_STATUSES,
    statusOptionsFromKeys,
    type KeyedStatusOption,
    type UserCouponStatus,
} from "@shop/common/domain"
import { ErrorCodes, toApiError } from "@shop/common/contract"
import { type AppLocale } from "@shop/i18n"
import type { WebMessageKey } from "#/locales/messages.gen"

export type MyCoupon = Omit<MyCouponResponse, "orderId"> & {
    orderId?: string
}

export type ClaimableCoupon = ClaimableCouponResponse

export type CouponTab = "UNUSED" | "USED" | "EXPIRED"

type BuyerBadgeVariant = "success" | "warning" | "secondary" | "outline"

type CouponStatusKey = Extract<WebMessageKey, `coupon.status.${string}`>

const COUPON_STATUS_META: Record<
    UserCouponStatus,
    { labelKey: CouponStatusKey; variant: BuyerBadgeVariant }
> = {
    UNUSED: { labelKey: "coupon.status.UNUSED", variant: "success" },
    LOCKED: { labelKey: "coupon.status.LOCKED", variant: "warning" },
    USED: { labelKey: "coupon.status.USED", variant: "secondary" },
    EXPIRED: { labelKey: "coupon.status.EXPIRED", variant: "outline" },
    VOID: { labelKey: "coupon.status.VOID", variant: "outline" },
}

const STATUS_BY_KEY: Record<
    string,
    { labelKey: CouponStatusKey; variant: BuyerBadgeVariant } | undefined
> = COUPON_STATUS_META

export function couponStatusMeta(status: string): {
    labelKey: CouponStatusKey | undefined
    variant: BuyerBadgeVariant
} {
    const meta = STATUS_BY_KEY[status]
    return { labelKey: meta?.labelKey, variant: meta?.variant ?? "outline" }
}

type CouponUnavailableReasonKey = Extract<WebMessageKey, `coupon.unavailable.${string}`>

const UNAVAILABLE_REASON_META: Record<string, CouponUnavailableReasonKey | undefined> = {
    NOT_EFFECTIVE: "coupon.unavailable.NOT_EFFECTIVE",
    EXPIRED: "coupon.unavailable.EXPIRED",
    THRESHOLD_NOT_MET: "coupon.unavailable.THRESHOLD_NOT_MET",
    CURRENCY_MISMATCH: "coupon.unavailable.CURRENCY_MISMATCH",
}

export function couponUnavailableReasonKey(
    reason: string | null | undefined,
): CouponUnavailableReasonKey | undefined {
    return reason ? UNAVAILABLE_REASON_META[reason] : undefined
}

type CouponSourceKey = Extract<WebMessageKey, `coupon.source.${string}`>

const COUPON_SOURCE_META: Record<string, CouponSourceKey | undefined> = {
    CLAIM: "coupon.source.CLAIM",
    REFUND_RETURN: "coupon.source.REFUND_RETURN",
}

export function couponSourceKey(source: string): CouponSourceKey | undefined {
    return COUPON_SOURCE_META[source]
}

export const COUPON_TABS: ReadonlyArray<KeyedStatusOption<CouponTab, CouponStatusKey>> =
    statusOptionsFromKeys<CouponTab, CouponStatusKey>(COUPON_STATUS_META, [
        "UNUSED",
        "USED",
        "EXPIRED",
    ])

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

export type CouponTimeReasonHint =
    | { key: "coupon.reason.notEffective"; datetime: string }
    | { key: "coupon.reason.expired" }

export function couponTimeReasonHint(
    coupon: MyCoupon,
    locale: AppLocale,
): CouponTimeReasonHint | undefined {
    if (coupon.status !== "UNUSED" && coupon.status !== "LOCKED") return undefined
    switch (coupon.unavailableReason) {
        case "NOT_EFFECTIVE":
            return {
                key: "coupon.reason.notEffective",
                datetime: formatDateTime(coupon.effectiveAt, locale),
            }
        case "EXPIRED":
            return { key: "coupon.reason.expired" }
        default:
            return undefined
    }
}

export function isCouponAlreadyClaimed(err: unknown): boolean {
    const e = toApiError(err)
    return e.code === ErrorCodes.COUPON_ALREADY_CLAIMED
}
