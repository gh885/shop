import { ReviewsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { MyReviewView } from "@shop/api/sdk"

export const myReviewKeys = {
    byOrder: (orderId: string) => ["reviews", "mine", orderId] as const,
}

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
