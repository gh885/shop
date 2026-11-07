import type { AdminMessageKey } from "#/locales/messages.gen"

export const REVIEW_MODERATE_PERMISSION = "REVIEW_MODERATE"

/** 评价状态词表：pending 待评（未公开）/ published 已评 / hidden 平台隐藏。 */
export const REVIEW_STATUSES = ["pending", "published", "hidden"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

type ReviewStatusKey = Extract<AdminMessageKey, `review.status.${string}`>

export const REVIEW_STATUS_META = {
    pending: { labelKey: "review.status.pending", variant: "secondary" },
    published: { labelKey: "review.status.published", variant: "info" },
    hidden: { labelKey: "review.status.hidden", variant: "warning" },
} as const satisfies Record<
    ReviewStatus,
    { labelKey: ReviewStatusKey; variant: "secondary" | "info" | "warning" }
>
