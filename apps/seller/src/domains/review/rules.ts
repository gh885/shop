import type { ReviewView } from "@shop/api/sdk"

/** 店铺评价行（卖家视角：含 hidden，昵称已由后端脱敏）。 */
export interface ReviewItem {
    id: string
    title: string
    specValues: string | null
    status: "published" | "hidden"
    overall: number | null
    content: string | null
    images: string[]
    content2: string | null
    images2: string[]
    replyContent: string | null
    anonymous: boolean
    displayName: string | null
    reviewedAt: string | null
}

export interface ReviewPageData {
    items: ReviewItem[]
    nextCursor: string | null
}

export function toReviewItem(row: ReviewView): ReviewItem {
    return {
        id: row.id,
        title: row.title,
        specValues: row.specValues,
        status: row.status as ReviewItem["status"],
        overall: row.overall,
        content: row.content || null,
        images: row.images,
        content2: row.content2 || null,
        images2: row.images2,
        replyContent: row.replyContent || null,
        anonymous: row.anonymous,
        displayName: row.displayName,
        reviewedAt: row.reviewedAt,
    }
}
