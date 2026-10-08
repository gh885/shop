import { ShopReviewStatus } from "@shop/api/sdk"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

type StatusKey = Extract<AdminMessageKey, `shopReview.status.${string}`>

/** 状态徽标：列表列、筛选下拉的选项与文案都从这一份读，三处各写一遍迟早措辞分家。句子在 catalog。 */
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

/** 筛选下拉的选项：从上面那张表派生 labelKey，值仍是状态枚举；句子在渲染点由本端 `t` 换。 */
export const STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<ShopReviewStatus, StatusKey>> =
    statusOptionsFromKeys(STATUS_BADGE)
