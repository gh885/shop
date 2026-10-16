import { LogisticsApi } from "@shop/api/sdk"
import type { OrderTrackingResponse } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

import { toApiError } from "@shop/common/contract"

const ORDER_TRACKING_KEY = ["order-tracking"] as const

export const orderTrackingOptions = (orderId: string) =>
    queryOptions({
        queryKey: [...ORDER_TRACKING_KEY, orderId],
        queryFn: async ({ signal }): Promise<OrderTrackingResponse | null> => {
            try {
                return await LogisticsApi.getOrderTracking({ path: { id: orderId }, signal })
            } catch (error) {
                // oxlint-disable-next-line no-null -- TanStack Query 以 undefined 表示「仍在加载」，404 归零必须返回 null（显式「无数据」的成功载荷）
                if (toApiError(error).status === 404) return null
                throw error
            }
        },
        staleTime: 30_000,
        retry: false,
    })
