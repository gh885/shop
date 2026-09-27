import { SellerReviewsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

export interface ReviewListSearch {
    page: number
    size: number
}

export const reviewKeys = {
    all: ["seller", "reviews"] as const,
    list: (shopId: string, s: ReviewListSearch) =>
        ["seller", "reviews", shopId, s.page, s.size] as const,
}

/** 本店评价列表（卖家只能看到自己店的：shopId 取自店铺上下文，不进 URL） */
export const shopReviewsOptions = (shopId: string, search: ReviewListSearch) =>
    queryOptions({
        queryKey: reviewKeys.list(shopId, search),
        queryFn: async () => {
            const page = await SellerReviewsApi.listMyShopReviews({
                query: { pageParams: { page: search.page, size: search.size } },
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })
