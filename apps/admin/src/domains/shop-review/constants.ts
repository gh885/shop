import { ShopReviewStatus } from "@shop/api/sdk"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

type StatusKey = Extract<AdminMessageKey, `shopReview.status.${string}`>

export const STATUS_BADGE: Record<
    ShopReviewStatus,
    { labelKey: StatusKey; variant: "warning" | "success" | "destructive-subtle" }
> = {
    PENDING: {
        labelKey: "shopReview.status.PENDING",
        variant: "warning",
    },
    APPROVED: {
        labelKey: "shopReview.status.APPROVED",
        variant: "success",
    },
    REJECTED: {
        labelKey: "shopReview.status.REJECTED",
        variant: "destructive-subtle",
    },
}

export const STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<ShopReviewStatus, StatusKey>> =
    statusOptionsFromKeys(STATUS_BADGE)
