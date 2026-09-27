import { PublicReviewsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import { REVIEW_PAGE_SIZE } from "./constants"

/** 商品评价列表的 key（商详评价区；分页是 URL 之外的组件内态，故 page 进 key） */
export const reviewKeys = {
    byProduct: (productId: string, page: number, size: number) =>
        ["reviews", "product", productId, page, size] as const,
}

/**
 * 商品评价区取数：一次拿聚合 + 分页列表。
 *
 * 聚合与列表在同一个响应里（REV-14：聚合按全量算、不受分页影响），所以只发一次请求——
 * 分成两个端点就会出现「列表翻页时好评率跟着变」的那个经典 bug。
 */
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
        // 服务端分页：翻页时保留上一份数据，避免整块评价区闪成骨架
        placeholderData: (previous) => previous,
    })
