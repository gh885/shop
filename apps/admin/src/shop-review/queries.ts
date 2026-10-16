import { AdminReviewsApi, ShopReviewStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

const ShopReviewStatusSchema = z.enum(ShopReviewStatus)

export const reviewSearchSchema = createPaginationSearchSchema(20).extend({
    status: ShopReviewStatusSchema.optional(),
})
export type ReviewSearch = z.infer<typeof reviewSearchSchema>

export const reviewKeys = {
    all: ["admin", "reviews"] as const,
    list: (input: ReviewSearch) => [...reviewKeys.all, input] as const,
} as const

export const reviewListOptions = (input: ReviewSearch) =>
    queryOptions({
        queryKey: reviewKeys.list(input),
        queryFn: async () => {
            const page = await AdminReviewsApi.listShopReviews({
                query: {
                    status: input.status,
                    pageParams: { page: input.page, size: input.size },
                },
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (prev) => prev,
    })
