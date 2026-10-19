import { SellerReviewsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

export interface ReviewListSearch {
    page: number
    size: number
}

export const reviewKeys = {
    all: ["reviews"] as const,
    list: (shopId: string, s: ReviewListSearch) => ["reviews", shopId, s.page, s.size] as const,
}

export const shopReviewsOptions = (shopId: string, search: ReviewListSearch) =>
    queryOptions({
        queryKey: reviewKeys.list(shopId, search),
        queryFn: async ({ signal }) => {
            const page = await SellerReviewsApi.listMyShopReviews({
                query: { pageParams: { page: search.page, size: search.size } },
                signal,
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })
