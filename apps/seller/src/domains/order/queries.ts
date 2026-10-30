import { queryOptions } from "@tanstack/react-query"
import { SellerOrderControllerApi, SellerRmaControllerApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"

import type { OrderListSearch } from "./search"
import type { RmaStatus } from "./constants"

export interface RmaListSearch {
    status?: RmaStatus
    cursor?: string
}

// shopId 由路由守卫（ShopGate）保证必有：key 里不出现 undefined，enabled 兜底可省
export const orderKeys = {
    all: ["orders"] as const,
    lists: (shopId: string) => [...orderKeys.all, shopId] as const,
    list: (shopId: string, s: OrderListSearch) =>
        [...orderKeys.lists(shopId), s.status ?? "all", s.cursor ?? ""] as const,
    detail: (id: string) => [...orderKeys.all, "detail", id] as const,
    shipments: (id: string) => [...orderKeys.all, "shipments", id] as const,
}

export const rmaKeys = {
    all: ["rma"] as const,
    lists: (shopId: string) => [...rmaKeys.all, shopId] as const,
    list: (shopId: string, search: RmaListSearch) =>
        [...rmaKeys.lists(shopId), search.status ?? "all", search.cursor ?? ""] as const,
    detail: (shopId: string, caseId: string | undefined) =>
        [...rmaKeys.all, "detail", shopId, caseId] as const,
}

/**
 * 订单详情。列表只给摘要（状态与金额），发货/售后决策都要行级数量（remaining），
 * 所以点开一行时按 id 拉详情——不在列表里塞整行，那是每页 20 次 N+1。
 */
export const orderDetailOptions = (orderId: string) =>
    queryOptions({
        queryKey: orderKeys.detail(orderId),
        queryFn: ({ signal }) =>
            SellerOrderControllerApi.sellerOrderDetail({
                path: { sellerOrderId: orderId },
                signal,
            }),
        throwOnError: false,
    })

// 游标分页：商家发新单时 offset 会漏条目
export const orderListOptions = (shopId: string, s: OrderListSearch) =>
    queryOptions({
        queryKey: orderKeys.list(shopId, s),
        queryFn: ({ signal }) =>
            SellerOrderControllerApi.listSellerOrders({
                query: { status: s.status, cursor: s.cursor, limit: s.size },
                signal,
            }),
        placeholderData: (prev) => prev,
    })

/** 售后单详情。404 = 该店查无此单（null 走空态），其它错误照常进错误态。 */
export const rmaDetailOptions = (shopId: string, caseId: string | undefined) =>
    queryOptions({
        queryKey: rmaKeys.detail(shopId, caseId),
        queryFn: async ({ signal }) => {
            if (!caseId) throw new Error("缺少售后单 ID")
            try {
                return await SellerRmaControllerApi.getSellerCase({ path: { caseId }, signal })
            } catch (error) {
                // oxlint-disable-next-line no-null -- Query 成功载荷不能是 undefined，用 null 表达查无数据
                if (toApiError(error).status === 404) return null
                throw error
            }
        },
        enabled: !!caseId,
        retry: false,
        // throwOnError:false：读它的只有决策弹窗，抛出去会把整张订单列表页换成错误页
        throwOnError: false,
    })

export const rmaListOptions = (shopId: string, search: RmaListSearch) =>
    queryOptions({
        queryKey: rmaKeys.list(shopId, search),
        queryFn: ({ signal }) =>
            SellerRmaControllerApi.listSellerCases({
                query: { status: search.status, cursor: search.cursor },
                signal,
            }),
        placeholderData: (prev) => prev,
    })
