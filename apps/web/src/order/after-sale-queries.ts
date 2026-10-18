import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { OrdersApi, type ApplyAfterSaleRequest, type TicketResponse } from "@shop/api/sdk"

import { toApiError } from "@shop/common/contract"
import { MY_TRADES_KEY, ORDER_DETAIL_KEY } from "./queries"

const AFTER_SALE_KEY = ["after-sale"] as const

export const afterSaleOptions = (orderId: string) =>
    queryOptions({
        queryKey: [...AFTER_SALE_KEY, orderId],
        queryFn: async ({ signal }): Promise<TicketResponse | null> => {
            try {
                return await OrdersApi.getAfterSale({ path: { id: orderId }, signal })
            } catch (error) {
                if (toApiError(error).status === 404)
                    // oxlint-disable-next-line no-null -- TanStack Query 以 undefined 表示「仍在加载」，404 归零必须返回 null（显式「无数据」的成功载荷）
                    return null
                throw error
            }
        },
        staleTime: 30_000,
        retry: false,
        throwOnError: false,
    })

async function applyAfterSale(orderId: string, input: ApplyAfterSaleRequest): Promise<void> {
    const reason = input.reason?.trim()
    await OrdersApi.applyAfterSale({
        path: { id: orderId },
        body: { type: input.type, reasonCode: input.reasonCode, reason: reason || undefined },
    })
}

async function returnAfterSale(
    orderId: string,
    input: { logisticsCompany: string; trackingNo: string },
): Promise<void> {
    await OrdersApi.returnGoods({
        path: { id: orderId },
        body: {
            logisticsCompany: input.logisticsCompany.trim(),
            trackingNo: input.trackingNo.trim(),
        },
    })
}

const AFTER_SALE_WRITE_INVALIDATES = [AFTER_SALE_KEY, ORDER_DETAIL_KEY, MY_TRADES_KEY]

export function useApplyAfterSale(orderId: string) {
    return useMutation({
        mutationFn: (input: ApplyAfterSaleRequest) => applyAfterSale(orderId, input),
        meta: {
            success: message("order.afterSale.toast.applied"),
            error: message("order.afterSale.toast.applyFailed"),
            invalidates: AFTER_SALE_WRITE_INVALIDATES,
        },
    })
}

export function useCancelAfterSale(orderId: string) {
    return useMutation({
        mutationFn: () => OrdersApi.cancelAfterSale({ path: { id: orderId } }),
        meta: {
            success: message("order.afterSale.toast.cancelled"),
            error: message("order.afterSale.toast.cancelFailed"),
            invalidates: AFTER_SALE_WRITE_INVALIDATES,
        },
    })
}

export function useReturnAfterSale(orderId: string) {
    return useMutation({
        mutationFn: (input: { logisticsCompany: string; trackingNo: string }) =>
            returnAfterSale(orderId, input),
        meta: {
            success: message("order.afterSale.toast.returnSubmitted"),
            error: message("order.afterSale.toast.returnSubmitFailed"),
            invalidates: AFTER_SALE_WRITE_INVALIDATES,
        },
    })
}
