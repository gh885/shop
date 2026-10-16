import { message } from "#/locales/message"
import { OrdersApi } from "@shop/api/sdk"
import type { CreateOrderRequest, PreviewOrderRequest, PreviewResponse } from "@shop/api/sdk"

import { statusToWire } from "./order-status"
import { toOrder, toOrderDetail } from "./mapper"
import type { OrderDetail, OrderStatus } from "./model"
import { queryOptions, useMutation } from "@tanstack/react-query"

export const MY_ORDERS_KEY = ["my-orders"] as const

export const MY_ORDERS_PAGE_SIZE = 20

export const ORDER_DETAIL_KEY = ["order-detail"] as const

export const myOrdersOptions = ({
    status,
    page = 1,
    size = MY_ORDERS_PAGE_SIZE,
}: { status?: OrderStatus | "all"; page?: number; size?: number } = {}) => {
    return queryOptions({
        queryKey: [...MY_ORDERS_KEY, status ?? "all", page, size],
        queryFn: async ({ signal }) => {
            const wire = {
                query: {
                    pageParams: { page, size },
                    query: {
                        status: status && status !== "all" ? statusToWire(status) : undefined,
                    },
                },
            } as const
            const result = await OrdersApi.listMyOrders({ ...wire, signal })
            return {
                records: result.records.map(toOrder),
                total: result.total,
            }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })
}

export const orderDetailOptions = (id: string, staleTime = 30_000) =>
    queryOptions({
        queryKey: [...ORDER_DETAIL_KEY, id],
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
            invalidates: [MY_ORDERS_KEY],
        },
        onSuccess: (_data, { orderId }, _ctx, { client }) =>
            void client.invalidateQueries({ queryKey: [...ORDER_DETAIL_KEY, orderId] }),
    })
}

export function useReceiveOrder() {
    return useMutation({
        mutationFn: (orderId: string) => OrdersApi.receiveOrder({ path: { id: orderId } }),
        meta: {
            success: message("order.toast.received"),
            error: message("order.toast.receiveFailed"),
            invalidates: [MY_ORDERS_KEY],
        },
        onSuccess: (_data, orderId, _ctx, { client }) =>
            void client.invalidateQueries({ queryKey: [...ORDER_DETAIL_KEY, orderId] }),
    })
}

export function useExtendReceive() {
    return useMutation({
        mutationFn: (orderId: string) => OrdersApi.extendReceive({ path: { id: orderId } }),
        meta: {
            success: message("order.toast.extended"),
            error: message("order.toast.extendFailed"),
            invalidates: [MY_ORDERS_KEY],
        },
        onSuccess: (_data, orderId, _ctx, { client }) =>
            void client.invalidateQueries({ queryKey: [...ORDER_DETAIL_KEY, orderId] }),
    })
}
