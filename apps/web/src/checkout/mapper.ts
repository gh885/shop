import type { PreviewResponse } from "@shop/api/sdk"

import type { CheckoutPreview } from "./checkout"

/** checkout/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。 */

/** wire → 领域：只做形状归一（image null→undefined、appliedCouponId 可空归一 null），不造假默认值。 */
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
