import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { BuyerRmaControllerApi, type CaseView } from "@shop/api/sdk"

import { orderKeys } from "./queries"

/**
 * 某张子订单的售后单列表（契约按 `sellerOrderId` 维度提供 apply，列表是全买家维度）。
 *
 * <p>没有「按子单查一张」的端点：列表接口拿回来后按 `sellerOrderId` 过滤，只取最新一张。
 */
export const afterSaleOptions = (sellerOrderId: string) =>
    queryOptions({
        queryKey: orderKeys.caseList(sellerOrderId),
        queryFn: async ({ signal }): Promise<CaseView | null> => {
            const page = await BuyerRmaControllerApi.listBuyerCases({
                query: { limit: 50 },
                signal,
            })
            return page.items.find((c) => c.sellerOrderId === sellerOrderId) ?? null
        },
        staleTime: 30_000,
        retry: false,
        throwOnError: false,
    })

export type ApplyAfterSaleInput = {
    type: string
    reasonCode: string
    sellerOrderId: string
    lines: { lineNo: number; quantity: number }[]
}

export function useApplyAfterSale() {
    return useMutation({
        mutationFn: (input: ApplyAfterSaleInput) => BuyerRmaControllerApi.apply({ body: input }),
        meta: {
            success: message("order.afterSale.toast.applied"),
            error: message("order.afterSale.toast.applyFailed"),
            // 售后单改变订单组的展示态（partially_refunded / refunded）
            invalidates: [orderKeys.all],
        },
    })
}

export function useCancelAfterSale() {
    return useMutation({
        mutationFn: (caseId: string) => BuyerRmaControllerApi.cancelCase({ path: { caseId } }),
        meta: {
            success: message("order.afterSale.toast.cancelled"),
            error: message("order.afterSale.toast.cancelFailed"),
            invalidates: [orderKeys.all],
        },
    })
}

export function useReturnAfterSale() {
    return useMutation({
        mutationFn: (input: { caseId: string; carrierCode: string; trackingNo: string }) =>
            BuyerRmaControllerApi.shipBack({
                path: { caseId: input.caseId },
                query: { carrierCode: input.carrierCode, trackingNo: input.trackingNo },
            }),
        meta: {
            success: message("order.afterSale.toast.returnSubmitted"),
            error: message("order.afterSale.toast.returnSubmitFailed"),
            invalidates: [orderKeys.all],
        },
    })
}
