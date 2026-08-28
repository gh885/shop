import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { notify } from "#/shared/lib/toast"

import { toCheckoutPreview, type CheckoutPreview } from "./checkout"
import { createOrder, createPayment, fetchPreview } from "#/order/use-order"

/** use-checkout —— 结算预览与下单/支付的 React 接线层。规则/类型在 ./checkout.ts。 */

/** 结算来源：购物车选中条目（cartItemIds）与立即购买（buySkuId+buyQuantity）二选一 */
export type CheckoutSource = {
    cartItemIds?: string[]
    buySkuId?: string
    buyQuantity?: number
}

const sourceKey = (s: CheckoutSource) =>
    s.cartItemIds && s.cartItemIds.length > 0
        ? s.cartItemIds.join(",")
        : `${s.buySkuId ?? ""}#${s.buyQuantity ?? 1}`

/** 结算预览：以来源为 key；地址切换 → 新 key 重新预览，避免手动 refetch */
export function useCheckoutPreview({
    source,
    addressId,
}: {
    source: CheckoutSource
    addressId?: string
}) {
    const enabled = (source.cartItemIds?.length ?? 0) > 0 || !!source.buySkuId
    return useQuery({
        queryKey: ["checkout-preview", sourceKey(source), addressId ?? ""] as const,
        queryFn: async (): Promise<CheckoutPreview> => {
            const res = await fetchPreview({ ...source, addressId })
            return toCheckoutPreview(res)
        },
        enabled,
        staleTime: 0,
        retry: false,
    })
}

/** 创建订单：一次结算按店拆 N 单，全成全败；成功后由调用方跳转支付 */
export function useCreateOrder() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { addressId: string; source: CheckoutSource; buyerMessage?: string }) =>
            createOrder({
                addressId: args.addressId,
                ...args.source,
                buyerMessage: args.buyerMessage,
            }),
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
