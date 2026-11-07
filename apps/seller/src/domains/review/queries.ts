import { message } from "#/locales/message"
import { SellerReviewControllerApi } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { toReviewItem } from "./rules"
import type { ReviewPageData } from "./rules"

const DEFAULT_PAGE_SIZE = 20

const reviewAll = ["reviews"] as const

export const sellerReviewKeys = {
    all: reviewAll,
    list: (
        shopId: string,
        star: number | undefined,
        replied: boolean | undefined,
        cursor: string,
        size: number,
    ) => [...reviewAll, "shop", shopId, star ?? "all", replied ?? "any", cursor, size] as const,
}

/**
 * 店铺评价列表：published + hidden 都给（被处置的行商家要能看见才知道为什么少了）。
 * star 1-5 精确筛，replied 三态。
 */
export const shopReviewsOptions = ({
    shopId,
    star,
    replied,
    cursor = "",
    size = DEFAULT_PAGE_SIZE,
}: {
    shopId: string
    star?: number
    replied?: boolean
    cursor?: string
    size?: number
}) =>
    queryOptions({
        queryKey: sellerReviewKeys.list(shopId, star, replied, cursor, size),
        queryFn: async ({ signal }): Promise<ReviewPageData> => {
            const page = await SellerReviewControllerApi.list2({
                query: {
                    shopId,
                    star,
                    replied,
                    cursor: cursor || undefined,
                    limit: size,
                },
                signal,
            })
            return { items: page.items.map(toReviewItem), nextCursor: page.nextCursor }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })

/** 回复一次：CAS 守卫，失败弹窗不关（提示走全局）。列表按 ["reviews"] 前缀整棵失效。 */
export function useReplyReview() {
    return useMutation({
        mutationFn: (input: { reviewId: string; content: string }) =>
            SellerReviewControllerApi.reply({
                path: { id: input.reviewId },
                body: { content: input.content },
            }),
        meta: {
            success: message("review.toast.replied"),
            error: message("review.toast.replyFailed"),
            invalidates: [reviewAll],
        },
    })
}
