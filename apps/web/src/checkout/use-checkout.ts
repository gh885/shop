import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { notify } from "#/shared/lib/toast"

import { toCheckoutPreview, type CheckoutPreview } from "./checkout"
import { createOrder, createPayment, fetchPreview } from "#/order/use-order"

/** use-checkout —— 结算预览与下单/支付的 React 接线层。规则/类型在 ./checkout.ts。 */

/** 结算预览：以 cartItemIds（或 buy）为 key；地址切换 → 新 key 重新预览，避免手动 refetch */
export function checkoutPreviewKey(args: { cartItemIds: string[]; addressId?: string }) {
    return ["checkout-preview", args.cartItemIds.join(","), args.addressId ?? ""] as const
}

export function useCheckoutPreview({
    cartItemIds,
    addressId,
}: {
    cartItemIds: string[]
    addressId?: string
}) {
    return useQuery({
        queryKey: checkoutPreviewKey({ cartItemIds, addressId }),
        queryFn: async (): Promise<CheckoutPreview> => {
            const res = await fetchPreview({ cartItemIds, addressId })
            return toCheckoutPreview(res)
        },
        enabled: cartItemIds.length > 0,
        staleTime: 0,
        retry: false,
    })
}

/** 创建订单：一次结算按店拆 N 单，全成全败；成功后由调用方跳转支付 */
export function useCreateOrder() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { addressId: string; cartItemIds: string[]; buyerMessage?: string }) =>
            createOrder(args),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["my-orders"] })
            qc.invalidateQueries({ queryKey: ["cart-items"] })
        },
        onError: (err) => notify.fromError(err, "下单失败"),
    })
}

/** 发起支付：下单成功后的新单逐单支付（V1 MOCK 即时成功） */
export function useCreatePayment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (orderId: string) => createPayment(orderId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["my-orders"] })
            qc.invalidateQueries({ queryKey: ["order-detail"] })
        },
        onError: (err) => notify.fromError(err, "支付失败"),
    })
}
