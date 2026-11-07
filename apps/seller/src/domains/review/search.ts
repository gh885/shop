import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

/** 评价工作台 URL 筛选契约：star 1-5、replied 三态、cursor 翻页。脏值兜底 undefined（不过滤）。 */
export type ReviewsSearchInput = SearchSchemaInput & {
    star?: string
    replied?: string
    cursor?: string
}

export const reviewsSearchSchema = z.object({
    star: z.preprocess(
        (value) => (typeof value === "string" && value !== "" ? Number(value) : undefined),
        z.number().int().min(1).max(5).optional().catch(undefined),
    ),
    replied: z.preprocess(
        (value) => (value === "true" ? true : value === "false" ? false : undefined),
        z.boolean().optional().catch(undefined),
    ),
    cursor: z.string().optional(),
})

export type ReviewsSearch = z.infer<typeof reviewsSearchSchema>

export function parseReviewsSearch(search: ReviewsSearchInput): ReviewsSearch {
    return reviewsSearchSchema.parse(search)
}
