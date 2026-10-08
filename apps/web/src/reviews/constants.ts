import type { WebMessageKey } from "#/locales/messages.gen"

/** 评价域的展示常量 */

/** 商详评价区每页条数：评价是「看前几条 + 翻页」的列表，10 条一屏能读完 */
export const REVIEW_PAGE_SIZE = 10

/** 星级文案的 catalog key 子集：`review.rating.<1..5>`，写错键即编译错 */
export type RatingKey = Extract<WebMessageKey, `review.rating.${string}`>

/**
 * 星级 → 展示文案 key（1~5，DB CHECK 与入参 @Min/@Max 同值）。句子进 catalog（§4.1）。
 * 越界星级在渲染点回落空串，不在表里再造一句「未知」——那个码本身就不该存在。
 */
export const RATING_LABEL: Record<number, RatingKey> = {
    1: "review.rating.1",
    2: "review.rating.2",
    3: "review.rating.3",
    4: "review.rating.4",
    5: "review.rating.5",
}
