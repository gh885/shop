import { queryOptions } from "@tanstack/react-query"

import type { OrderStatus, TicketStatus } from "@shop/api/sdk"

import { listAfterSaleTickets, listCarriers, listOrders, getShopAfterSale } from "./data"

/**
 * orders 域的 TanStack Query 定义层：只放声明式、无状态的 query 定义与 key 工厂。
 * 有状态编排 hooks（useOrderList 这类视图模型）留在页面旁，内部消费本文件 options。
 */

export interface OrderListSearch {
    status?: OrderStatus
    page: number
    size: number
}

/** 退款售后工作台的查询参数（status 空 = 全部） */
export interface AfterSaleListSearch {
    status?: TicketStatus
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

/** 承运商字典与店铺无关，单独一棵 key 树，不进 orders 前缀（失效订单不影响它） */
const carrierKeys = {
    all: ["carriers"] as const,
}

/** 售后单（决策弹窗用）：orderId 为空即不发请求（弹窗关着不该拉数据） */
export const afterSaleKeys = {
    /** 单张售后单详情前缀：[..., shopId] 可一发失效该店全部详情 */
    details: (shopId?: string) => ["after-sale", shopId] as const,
    detail: (shopId: string | undefined, orderId: string | undefined) =>
        ["after-sale", shopId, orderId] as const,
}

export const shopAfterSaleOptions = (shopId: string | undefined, orderId: string | undefined) =>
    queryOptions({
        queryKey: afterSaleKeys.detail(shopId, orderId),
        queryFn: () => {
            if (!orderId) throw new Error("缺少订单 ID")
            return getShopAfterSale(orderId)
        },
        enabled: !!shopId && !!orderId,
        retry: false,
    })

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

/** 退款售后工作台的列表 key：与订单列表分开两棵树（各失效各的，互不牵连） */
export const afterSaleListKeys = {
    all: ["after-sales"] as const,
    lists: (shopId?: string) => ["after-sales", shopId] as const,
    list: (shopId: string | undefined, s: AfterSaleListSearch) =>
        ["after-sales", shopId, s.status ?? "all", s.page, s.size] as const,
}

/** 本店售后单分页列表（工作台） */
export const afterSaleListOptions = (shopId: string | undefined, s: AfterSaleListSearch) =>
    queryOptions({
        queryKey: afterSaleListKeys.list(shopId, s),
        queryFn: () =>
            listAfterSaleTickets({
                page: s.page,
                size: s.size,
                status: s.status,
            }),
        enabled: !!shopId,
        placeholderData: (prev) => prev,
    })

/** 发货下拉的快递公司字典：低频变更的公共字典，长缓存（字典维护是运维动作，不随页面来回拉） */
export const carrierListOptions = () =>
    queryOptions({
        queryKey: carrierKeys.all,
        queryFn: listCarriers,
        staleTime: 10 * 60_000,
    })
