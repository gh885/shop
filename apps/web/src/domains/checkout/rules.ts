import { sumMoney, type Money } from "@shop/common/domain"
import type { Address, Group, Item, UnavailableLine as SdkUnavailableLine } from "@shop/api/sdk"

type CheckoutLine = Omit<Item, "image"> & { image?: string }

export type CheckoutGroup = Omit<Group, "lines"> & { lines: CheckoutLine[] }

export type UnavailableLine = Omit<SdkUnavailableLine, "image"> & { image?: string }

export type CouponChoice = { kind: "use"; id: string } | { kind: "none" }

export type CouponSelection = Record<string, CouponChoice>

export type CheckoutPreview = {
    groups: CheckoutGroup[]
    unavailable: UnavailableLine[]
    address?: Address
    totalPayAmount: Money
}

export function defaultCouponChoice(group: CheckoutGroup): CouponChoice {
    const usable = group.coupons.find((c) => c.usable)
    return usable ? { kind: "use", id: usable.userCouponId } : { kind: "none" }
}

export function withDefaultCoupons(
    groups: CheckoutGroup[],
    choice: CouponSelection,
): CouponSelection {
    let changed = false
    const next: CouponSelection = { ...choice }
    for (const shopId of Object.keys(next)) {
        if (groups.some((g) => g.shopId === shopId)) continue
        delete next[shopId]
        changed = true
    }
    for (const g of groups) {
        if (g.shopId in next) continue
        next[g.shopId] = defaultCouponChoice(g)
        changed = true
    }
    return changed ? next : choice
}

export function couponIdsOf(selection: CouponSelection): string[] {
    return Object.values(selection)
        .flatMap((c) => (c.kind === "use" ? [c.id] : []))
        .toSorted()
}

export type CheckoutTotals = {
    itemAmount: Money
    shippingFee: Money
    discountAmount: Money
}

export function checkoutTotals(preview: CheckoutPreview | undefined): CheckoutTotals {
    const groups = preview?.groups ?? []
    return {
        itemAmount: sumMoney(groups.map((g) => g.itemAmount)),
        shippingFee: sumMoney(groups.map((g) => g.shippingFee)),
        discountAmount: sumMoney(groups.map((g) => g.discountAmount)),
    }
}
