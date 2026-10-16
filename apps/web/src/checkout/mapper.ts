import type { PreviewResponse } from "@shop/api/sdk"

import type { CheckoutPreview } from "./checkout"

export function toCheckoutPreview(dto: PreviewResponse): CheckoutPreview {
    return {
        groups: dto.groups.map((g) => ({
            ...g,
            lines: g.lines.map((l) => ({ ...l, image: l.image ?? undefined })),
            // oxlint-disable-next-line no-null -- 契约透传：Group.appliedCouponId 为 string | null（可空归一 null）
            appliedCouponId: g.appliedCouponId ?? null,
        })),
        unavailable: dto.unavailable.map((u) => ({ ...u, image: u.image ?? undefined })),
        address: dto.address ?? undefined,
        totalPayAmount: dto.totalPayAmount,
    }
}
