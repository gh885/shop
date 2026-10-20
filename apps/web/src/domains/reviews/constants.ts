import type { WebMessageKey } from "#/locales/messages.gen"

export const REVIEW_PAGE_SIZE = 10

export type RatingKey = Extract<WebMessageKey, `review.rating.${string}`>

export const RATING_LABEL: Record<number, RatingKey> = {
    1: "review.rating.1",
    2: "review.rating.2",
    3: "review.rating.3",
    4: "review.rating.4",
    5: "review.rating.5",
}
