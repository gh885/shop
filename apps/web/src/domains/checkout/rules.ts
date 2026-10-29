import { sumMoney, type Money } from "@shop/common/domain"
import type { Group, QuoteLineView, UnavailableLine as SdkUnavailableLine } from "@shop/api/sdk"

export type CheckoutLine = QuoteLineView

export type CheckoutGroup = Group & { lines: CheckoutLine[] }

export type UnavailableLine = SdkUnavailableLine

export type CheckoutPreview = {
    quoteId: string
    expiresAt: string
    goods: Money
    discount: Money
    shipping: Money
    payableAmount: Money
    groups: CheckoutGroup[]
    unavailable: UnavailableLine[]
}

export type CheckoutTotals = {
    goods: Money
    shipping: Money
    discount: Money
    payable: Money
}

/** 金额全部来自 quote：前端不自己算钱，只把各档摆出来 */
export function checkoutTotals(preview: CheckoutPreview | undefined): CheckoutTotals {
    return {
        goods: preview?.goods ?? sumMoney([]),
        shipping: preview?.shipping ?? sumMoney([]),
        discount: preview?.discount ?? sumMoney([]),
        payable: preview?.payableAmount ?? sumMoney([]),
    }
}
