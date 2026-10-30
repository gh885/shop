import { message } from "#/locales/message"
import { BuyerOrderControllerApi, BuyerShipmentControllerApi } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { toOrderDetail, toTrade } from "./mapper"
import type { OrderDetail, Trade } from "./rules"
import type { OrderTab } from "./search"

const DEFAULT_PAGE_SIZE = 20

const orderAll = ["orders"] as const

export const orderKeys = {
    all: orderAll,
    trades: [...orderAll, "list"] as const,
    tradeList: (tab: OrderTab, size: number, cursor: string) =>
        [...orderKeys.trades, tab, size, cursor] as const,
    detail: (id: string) => [...orderAll, "detail", id] as const,
    cases: [...orderAll, "cases"] as const,
    caseList: (sellerOrderId: string) => [...orderKeys.cases, sellerOrderId] as const,
}

/**
 * 我的订单：游标分页，页签直接是后端展示态。
 *
 * <p>`all` 不上行：接口拿到空 status 就是全部档，前端不造后端不认识的词。
 */
export const myTradesOptions = ({
    tab = "all",
    cursor = "",
    size = DEFAULT_PAGE_SIZE,
}: {
    tab?: OrderTab
    cursor?: string
    size?: number
} = {}) =>
    queryOptions({
        queryKey: orderKeys.tradeList(tab, size, cursor),
        queryFn: async ({ signal }): Promise<{ records: Trade[]; nextCursor: string | null }> => {
            const page = await BuyerOrderControllerApi.listBuyerOrders({
                query: {
                    status: tab === "all" ? undefined : tab,
                    cursor: cursor || undefined,
                    limit: size,
                },
                signal,
            })
            return { records: page.items.map(toTrade), nextCursor: page.nextCursor }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })

export const orderDetailOptions = (id: string, staleTime = 30_000) =>
    queryOptions({
        queryKey: orderKeys.detail(id),
        queryFn: async ({ signal }): Promise<OrderDetail> =>
            toOrderDetail(
                await BuyerOrderControllerApi.buyerOrderDetail({
                    path: { orderGroupId: id },
                    signal,
                }),
            ),
        staleTime,
        retry: false,
    })

export function useCancelOrder() {
    return useMutation({
        mutationFn: (orderGroupId: string) =>
            BuyerOrderControllerApi.cancelOrder({ path: { orderGroupId } }),
        meta: {
            success: message("order.toast.cancelled"),
            error: message("order.toast.cancelFailed"),
            invalidates: [orderKeys.trades],
        },
        onSuccess: (_data, orderGroupId, _ctx, { client }) =>
            void client.invalidateQueries({ queryKey: orderKeys.detail(orderGroupId) }),
    })
}

/** 确认收货按包裹：先取该子单的包裹，逐个签收。包裹互相独立、后端 CAS 各自裁决，并行发 */
export function useReceiveOrder() {
    return useMutation({
        mutationFn: async (sellerOrderId: string) => {
            const packages = await BuyerShipmentControllerApi.shipments({
                path: { sellerOrderId },
            })
            await Promise.all(
                packages.map((pkg) =>
                    BuyerShipmentControllerApi.receivePackage({
                        path: { packageId: pkg.packageId },
                    }),
                ),
            )
        },
        meta: {
            success: message("order.toast.received"),
            error: message("order.toast.receiveFailed"),
            invalidates: [orderKeys.all],
        },
    })
}

/** 子单的包裹列表：自动确认倒计时从在途包裹的 autoReceiveAt 取（fulfillment 算好下发，前端不抄宽限天数） */
export const sellerPackagesOptions = (sellerOrderId: string) =>
    queryOptions({
        queryKey: [...orderAll, "packages", sellerOrderId] as const,
        queryFn: ({ signal }) =>
            BuyerShipmentControllerApi.shipments({ path: { sellerOrderId }, signal }),
        staleTime: 30_000,
    })
