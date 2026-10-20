import { LogisticsApi } from "@shop/api/sdk"
import type { OrderTrackingResponse } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

import { toApiError } from "@shop/common/contract"

const logisticsKeys = {
    all: ["order-tracking"] as const,
    orderTracking: (orderId: string) => [...logisticsKeys.all, orderId] as const,
}

export const orderTrackingOptions = (orderId: string) =>
    queryOptions({
        queryKey: logisticsKeys.orderTracking(orderId),
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
