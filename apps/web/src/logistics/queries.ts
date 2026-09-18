import { LogisticsApi } from "@shop/api/sdk"
import type { OrderTrackingResponse } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

import { toApiError } from "@shop/common"

/**
 * logistics/queries —— 物流轨迹的数据层（fetch + queryOptions）。
 *
 * 轨迹只在买家物流页消费，且是受保护路由（挂载时必已登录）。SSR 阶段服务端拿不到 token，
 * loader 在服务端直接跳过、只在客户端读缓存/取数，错误与挂起由路由边界接管。
 */

/** 轨迹缓存 key 前缀：精确 key 为 [ORDER_TRACKING_KEY, orderId] */
const ORDER_TRACKING_KEY = ["order-tracking"] as const

/**
 * 订单物流轨迹（一单多包裹）。
 *
 * **未发货不是错误**：后端给 404，那是「还没有物流」这一业务事实。按仓库统一口径在 queryFn 里
 * 归零为 `null`（与 after-sale / shipping-template 同范式）—— 页面因此只剩「有轨迹 / 没有轨迹」
 * 两态，不必把 404 混进错误态、再在组件里拆回来。
 */
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
        // 404 已在 queryFn 归零，其余错误即时暴露（重试只会让错误页晚几秒出现）
        retry: false,
    })
