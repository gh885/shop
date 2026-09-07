import { queryOptions } from "@tanstack/react-query"

import type { OrderStatus } from "@shop/api/sdk"

import { listOrders } from "./data"

/**
 * orders 域的 TanStack Query 定义层：只放声明式、无状态的 query 定义与 key 工厂。
 * 有状态编排 hooks（useOrderList 这类视图模型）留在页面旁，内部消费本文件 options。
 */

export interface OrderListSearch {
    status?: OrderStatus
    page: number
    size: number
}

export const orderKeys = {
    all: ["orders"] as const,
    lists: (shopId?: string) => ["orders", shopId] as const,
    list: (shopId: string | undefined, s: OrderListSearch) =>
        ["orders", shopId, s.status ?? "all", s.page, s.size] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
}

/** 店铺订单分页列表（shopId 入 key：切店铺不串缓存） */
export const orderListOptions = (shopId: string | undefined, s: OrderListSearch) =>
    queryOptions({
        queryKey: orderKeys.list(shopId, s),
        queryFn: () =>
            listOrders({
                page: s.page,
                size: s.size,
                status: s.status,
            }),
        enabled: !!shopId,
        placeholderData: (prev) => prev,
    })
