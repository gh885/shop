import type { QuoteResponse } from "@shop/api/sdk"

import type { CheckoutPreview } from "./rules"

/** quote 就是结算预览：形状直通，不再做 image 可空归一（QuoteLineView.imageUrl 非空） */
export function toCheckoutPreview(dto: QuoteResponse): CheckoutPreview {
    return {
        quoteId: dto.quoteId,
        expiresAt: dto.expiresAt,
        goods: dto.goods,
        discount: dto.discount,
        shipping: dto.shipping,
        payableAmount: dto.payableAmount,
        groups: dto.groups,
        unavailable: dto.unavailable,
    }
}
