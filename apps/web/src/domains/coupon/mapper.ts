import type { ClaimableCouponResponse, MyCouponResponse } from "@shop/api/sdk"

import type { ClaimableCoupon, MyCoupon } from "./rules"

export function toMyCoupon(dto: MyCouponResponse): MyCoupon {
    return { ...dto, orderId: dto.orderId ?? undefined }
}

export function toClaimableCoupon(dto: ClaimableCouponResponse): ClaimableCoupon {
    return { ...dto }
}
