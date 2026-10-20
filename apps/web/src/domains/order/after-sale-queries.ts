import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { OrdersApi, type ApplyRefundRequest, type RefundResponse } from "@shop/api/sdk"

import { toApiError } from "@shop/common/contract"
import { orderKeys } from "./queries"

/**
 * 最近一张退款单（优先进行中，含终态）：没有退款记录时后端给 404，这里归零成 null
 * ——404 是「没有」不是错误，组件按「未申请过」渲染。
 */
export const afterSaleOptions = (orderId: string) =>
    queryOptions({
        queryKey: orderKeys.refundDetail(orderId),
        queryFn: async ({ signal }): Promise<RefundResponse | null> => {
            try {
                return await OrdersApi.getRefund({ path: { id: orderId }, signal })
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

async function applyRefund(orderId: string, input: ApplyRefundRequest): Promise<void> {
    const reason = input.reason?.trim()
    await OrdersApi.applyRefund({
        path: { id: orderId },
        body: {
            type: input.type,
            reasonCode: input.reasonCode,
            reason: reason || undefined,
            lines: input.lines,
        },
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

// 退款状态变化会改订单详情里的角标与已退额，也会改主订单卡片的角标与主进度——整棵 order 树都受影响
const REFUND_WRITE_INVALIDATES = [orderKeys.all]

export function useApplyAfterSale(orderId: string) {
    return useMutation({
        mutationFn: (input: ApplyRefundRequest) => applyRefund(orderId, input),
        meta: {
            success: message("order.afterSale.toast.applied"),
            error: message("order.afterSale.toast.applyFailed"),
            invalidates: REFUND_WRITE_INVALIDATES,
        },
    })
}

export function useCancelAfterSale(orderId: string) {
    return useMutation({
        mutationFn: () => OrdersApi.cancelRefund({ path: { id: orderId } }),
        meta: {
            success: message("order.afterSale.toast.cancelled"),
            error: message("order.afterSale.toast.cancelFailed"),
            invalidates: REFUND_WRITE_INVALIDATES,
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
            invalidates: REFUND_WRITE_INVALIDATES,
        },
    })
}
