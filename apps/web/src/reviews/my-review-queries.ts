import { ReviewsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { MyReviewView } from "@shop/api/sdk"

/** 我的评价 key（订单评价页/弹窗读；追评后失效重取） */
export const myReviewKeys = {
    byOrder: (orderId: string) => ["reviews", "mine", orderId] as const,
}

/**
 * 我对某一单的评价。**404 是正常分支而不是错误**（还没评价），所以 queryFn 把 404 归一成
 * `null` 而不是让它抛：抛的话弹窗会跳进错误边界，而「还没评价」是这一屏最正常的状态。
 */
export const myReviewOptions = (orderId: string) =>
    queryOptions({
        queryKey: myReviewKeys.byOrder(orderId),
        queryFn: async (): Promise<MyReviewView | null> => {
            try {
                return await ReviewsApi.getOrderReview({ path: { orderId } })
            } catch (error) {
                if ((error as { status?: number }).status === 404) return null
                throw error
            }
        },
    })
