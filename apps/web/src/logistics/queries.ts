import { LogisticsApi } from "@shop/api/sdk"
import type { OrderTrackingResponse } from "@shop/api/sdk"
import { queryOptions, useQuery } from "@tanstack/react-query"

/**
 * logistics/queries —— 物流轨迹的数据层（fetch + queryOptions + hook）。
 *
 * 轨迹只在买家物流页消费，且是受保护路由（挂载时必已登录），所以不进 route loader，
 * 由组件侧 useQuery 在客户端拉取——与订单页「受保护页数据客户端取」的结论一致。
 */

/** 轨迹缓存 key 前缀：精确 key 为 [ORDER_TRACKING_KEY, orderId] */
export const ORDER_TRACKING_KEY = ["order-tracking"] as const

const orderTrackingOptions = (orderId: string) =>
    queryOptions({
        queryKey: [...ORDER_TRACKING_KEY, orderId],
        queryFn: async ({ signal }): Promise<OrderTrackingResponse> =>
            await LogisticsApi.getOrderTracking({ path: { id: orderId }, signal }),
        staleTime: 30_000,
        // 未发货时后端给 404。这不是瞬时故障：重试只会让「暂无物流信息」晚几秒才出现
        retry: false,
    })

/** 订单物流轨迹（一单多包裹；未发货 404） */
export function useOrderTracking(orderId: string) {
    return useQuery(orderTrackingOptions(orderId))
}
