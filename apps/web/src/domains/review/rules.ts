import type { ReviewView } from "@shop/api/sdk"

/** 评价条目（三处共用：待评价、我的评价、商详公开区）。时间原样透传给 TimeText。 */
export interface ReviewItem {
    id: string
    sellerOrderId: string
    lineNo: number
    spuId: string
    title: string
    imageUrl: string
    /** 规格快照原文（jsonb 字符串），解析后展示「买的是哪个规格」 */
    specValues: string | null
    status: "pending" | "published" | "hidden"
    overall: number | null
    descScore: number | null
    serviceScore: number | null
    logisticsScore: number | null
    content: string | null
    images: string[]
    content2: string | null
    images2: string[]
    appendedAt: string | null
    replyContent: string | null
    replyAt: string | null
    anonymous: boolean
    /** 脱敏昵称；匿名行 null（前端渲染「匿名」） */
    displayName: string | null
    reviewableUntil: string | null
    reviewedAt: string | null
    createdAt: string
}

export interface ReviewPageData {
    items: ReviewItem[]
    nextCursor: string | null
}

export interface SpuReviewStats {
    total: number
    /** 均分百分位整数（450 = 4.5） */
    avgScore: number
    goodCount: number
    midCount: number
    badCount: number
    withImageCount: number
}

export interface SpuReviewSectionData extends ReviewPageData {
    stats: SpuReviewStats
}

/** 公开评价区的筛选档，与后端 mapper 的 filter 词表一一对应 */
export const REVIEW_FILTERS = ["all", "with_image", "good", "mid", "bad"] as const
export type ReviewFilter = (typeof REVIEW_FILTERS)[number]

export function toReviewItem(row: ReviewView): ReviewItem {
    return {
        id: row.id,
        sellerOrderId: row.sellerOrderId,
        lineNo: row.lineNo,
        spuId: row.spuId,
        title: row.title,
        imageUrl: row.imageUrl ?? "",
        specValues: row.specValues,
        status: row.status as ReviewItem["status"],
        overall: row.overall,
        descScore: row.descScore,
        serviceScore: row.serviceScore,
        logisticsScore: row.logisticsScore,
        // 空串归一成 null：契约里可空，渲染层不该见到 ""
        content: row.content || null,
        images: row.images,
        content2: row.content2 || null,
        images2: row.images2,
        appendedAt: row.appendedAt,
        replyContent: row.replyContent || null,
        replyAt: row.replyAt,
        anonymous: row.anonymous,
        displayName: row.displayName,
        reviewableUntil: row.reviewableUntil,
        reviewedAt: row.reviewedAt,
        createdAt: row.createdAt,
    }
}
