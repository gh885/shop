import { AdminReviewsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { ReviewSearch } from "./search"

export const reviewKeys = {
    all: ["reviews"] as const,
    list: (input: ReviewSearch) => [...reviewKeys.all, input] as const,
} as const

export const reviewListOptions = (input: ReviewSearch) =>
    queryOptions({
        queryKey: reviewKeys.list(input),
        queryFn: async ({ signal }) => {
            const page = await AdminReviewsApi.listShopReviews({
                query: {
                    status: input.status,
                    pageParams: { page: input.page, size: input.size },
                },
                signal,
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (prev) => prev,
    })
