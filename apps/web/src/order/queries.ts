import { message } from "#/locales/message"
import { OrdersApi } from "@shop/api/sdk"
import type { CreateOrderRequest, PreviewOrderRequest, PreviewResponse } from "@shop/api/sdk"

import { mainProgressToWire } from "./order-status"
import { toOrderDetail, toTrade } from "./mapper"
import type { OrderDetail, Trade } from "./model"
import type { OrderTab } from "./orders-search"
import { queryOptions, useMutation } from "@tanstack/react-query"

export const MY_TRADES_PAGE_SIZE = 20

const orderAll = ["orders"] as const

export const orderKeys = {
    all: orderAll,
    trades: [...orderAll, "list"] as const,
    tradeList: (tab: OrderTab, page: number, size: number) =>
        [...orderKeys.trades, tab, page, size] as const,
    tradeDetails: [...orderAll, "trade-detail"] as const,
    tradeDetail: (id: string) => [...orderKeys.tradeDetails, id] as const,
    orderDetails: [...orderAll, "order-detail"] as const,
    orderDetail: (id: string) => [...orderKeys.orderDetails, id] as const,
    refunds: [...orderAll, "refund"] as const,
    refundDetail: (orderId: string) => [...orderKeys.refunds, orderId] as const,
}

/**
 * 我的订单：以主订单为单位分页，页签传主进度（§5.3）。
 *
 * <p>`all` 不上行：接口拿到空 progress 就是全部档，前端不必造一个后端不认识的词。
 */
export const myTradesOptions = ({
    tab = "all",
    page = 1,
    size = MY_TRADES_PAGE_SIZE,
}: {
    tab?: OrderTab
    page?: number
    size?: number
} = {}) => {
    return queryOptions({
        queryKey: orderKeys.tradeList(tab, page, size),
        queryFn: async ({ signal }) => {
            const result = await OrdersApi.listMyTrades({
                query: {
                    pageParams: { page, size },
                    query: { progress: tab === "all" ? undefined : mainProgressToWire(tab) },
                },
                signal,
            })
            return {
                records: result.records.map(toTrade),
                total: result.total,
            }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })
}

/** 主订单详情：收银台与列表卡片同一形状 */
export const tradeDetailOptions = (tradeId: string, staleTime = 30_000) =>
    queryOptions({
        queryKey: orderKeys.tradeDetail(tradeId),
        queryFn: async ({ signal }): Promise<Trade> =>
            toTrade(await OrdersApi.getTradeDetail({ path: { id: tradeId }, signal })),
        staleTime,
        retry: false,
    })

export const orderDetailOptions = (id: string, staleTime = 30_000) =>
    queryOptions({
        queryKey: orderKeys.orderDetail(id),
        queryFn: async ({ signal }): Promise<OrderDetail> =>
            toOrderDetail(await OrdersApi.getOrderDetail({ path: { id }, signal })),
        staleTime,
        retry: false,
    })

export async function fetchPreview(args: PreviewOrderRequest): Promise<PreviewResponse> {
    return await OrdersApi.previewOrder({
        body: {
            lines: args.lines,
            addressId: args.addressId,
            userCouponIds: args.userCouponIds?.length ? args.userCouponIds : undefined,
        },
    })
}

export async function createOrder(args: CreateOrderRequest) {
    return await OrdersApi.createOrder({
        body: {
            ...args,
            userCouponIds: args.userCouponIds?.length ? args.userCouponIds : undefined,
        },
    })
}

export function useCancelOrder() {
    return useMutation({
        mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
            OrdersApi.cancelOrder({
                path: { id: orderId },
                body: { reason: reason?.trim() || undefined },
            }),
        meta: {
            success: message("order.toast.cancelled"),
            error: message("order.toast.cancelFailed"),
            invalidates: [orderKeys.trades],
        },
        onSuccess: (_data, { orderId }, _ctx, { client }) =>
            void client.invalidateQueries({ queryKey: orderKeys.orderDetail(orderId) }),
    })
}

export function useReceiveOrder() {
    return useMutation({
        mutationFn: (orderId: string) => OrdersApi.receiveOrder({ path: { id: orderId } }),
        meta: {
            success: message("order.toast.received"),
            error: message("order.toast.receiveFailed"),
            invalidates: [orderKeys.trades],
        },
        onSuccess: (_data, orderId, _ctx, { client }) =>
            void client.invalidateQueries({ queryKey: orderKeys.orderDetail(orderId) }),
    })
}

export function useExtendReceive() {
    return useMutation({
        mutationFn: (orderId: string) => OrdersApi.extendReceive({ path: { id: orderId } }),
        meta: {
            success: message("order.toast.extended"),
            error: message("order.toast.extendFailed"),
            invalidates: [orderKeys.trades],
        },
        onSuccess: (_data, orderId, _ctx, { client }) =>
            void client.invalidateQueries({ queryKey: orderKeys.orderDetail(orderId) }),
    })
}
