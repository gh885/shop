import { PublicReviewsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import { REVIEW_PAGE_SIZE } from "./constants"

export const reviewKeys = {
    byProduct: (productId: string, page: number, size: number) =>
        ["reviews", "product", productId, page, size] as const,
}

export const productReviewsOptions = (productId: string, page = 1, size = REVIEW_PAGE_SIZE) =>
    queryOptions({
        queryKey: reviewKeys.byProduct(productId, page, size),
        queryFn: async () => {
            const result = await PublicReviewsApi.listProductReviews({
                path: { productId },
                query: { pageParams: { page, size } },
            })
            return { summary: result.summary, page: result.page }
        },
        placeholderData: (previous) => previous,
    })
