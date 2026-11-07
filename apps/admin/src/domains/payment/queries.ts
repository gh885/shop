import { AdminSuspenseControllerApi } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { message } from "#/locales/message"

export const paymentKeys = {
    suspense: {
        all: ["payments", "suspense"] as const,
        list: ["payments", "suspense", "list"] as const,
    },
} as const

/**
 * 挂账清单。后端封顶 200 条、open 排前，一次拉全，不做游标分页；
 * 状态筛选在前端做——挂账是人看的工作面，不承载分享与回跳。
 */
export const suspenseListOptions = () =>
    queryOptions({
        queryKey: paymentKeys.suspense.list,
        queryFn: ({ signal }) => AdminSuspenseControllerApi.listSuspense({ signal }),
    })

/**
 * 挂账退款（原路退回）。渠道没受理时后端保持 open、可重复点——
 * 列表刷新后的状态就是受理结果，这里不替后端下结论。
 */
export function useRefundSuspense() {
    return useMutation({
        mutationFn: (id: string) => AdminSuspenseControllerApi.refund({ path: { id } }),
        meta: {
            success: message("payment.refund.done"),
            error: message("payment.refund.failed"),
            invalidates: [paymentKeys.suspense.all],
        },
    })
}

/** 驳回：确认这不是要退的钱。原因必填，落库进 note。 */
export function useDismissSuspense() {
    return useMutation({
        mutationFn: (input: { id: string; note: string }) =>
            AdminSuspenseControllerApi.dismiss({
                path: { id: input.id },
                body: { note: input.note },
            }),
        meta: {
            success: message("payment.dismiss.done"),
            error: message("payment.dismiss.failed"),
            invalidates: [paymentKeys.suspense.all],
        },
    })
}
