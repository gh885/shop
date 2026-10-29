import { AdminGovernanceSellerControllerApi } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { message } from "#/locales/message"

export const governanceKeys = {
    sellers: {
        all: ["governance", "sellers"] as const,
        queue: (status: string | undefined) =>
            ["governance", "sellers", "queue", status ?? "all"] as const,
    },
} as const

/** 审核队列。后端封顶 100 条且靠人处理，一次拉全，不做游标分页。 */
export const sellerQueueOptions = (status: string | undefined) =>
    queryOptions({
        queryKey: governanceKeys.sellers.queue(status),
        queryFn: ({ signal }) =>
            AdminGovernanceSellerControllerApi.queue({ query: { status }, signal }),
    })

/** 入驻审核通过。通过即生效——没有中间态，canSell 的门从此放行。 */
export function useApproveMerchant() {
    return useMutation({
        mutationFn: (merchantId: string) =>
            AdminGovernanceSellerControllerApi.approve({ path: { merchantId } }),
        meta: {
            success: message("governance.approve.done"),
            error: message("governance.approve.failed"),
            invalidates: [governanceKeys.sellers.all],
        },
    })
}

/** 入驻审核驳回。理由必填——商家要能据它改材料再重提。 */
export function useRejectMerchant() {
    return useMutation({
        mutationFn: (input: { merchantId: string; reason: string }) =>
            AdminGovernanceSellerControllerApi.reject({
                path: { merchantId: input.merchantId },
                body: { reason: input.reason },
            }),
        meta: {
            success: message("governance.reject.done"),
            error: message("governance.reject.failed"),
            invalidates: [governanceKeys.sellers.all],
        },
    })
}
