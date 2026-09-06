import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { notify } from "#/shared/lib/toast"

import { toCheckoutPreview, type CheckoutPreview } from "./checkout"
import { confirmPayment, createOrder, createPayment, fetchPreview } from "#/order/queries"

/** checkout/queries —— 结算预览与下单/支付的 React 接线层。规则/类型在 ./checkout.ts。 */

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
            qc.invalidateQueries({ queryKey: ["cart-items"] }) // 后端 CartCheckedOutEvent 已删已购条目，缓存随之失效
            qc.invalidateQueries({ queryKey: ["cart-count"] })
        },
        onError: (err) => notify.fromError(err, "下单失败"),
    })
}

/** 发起支付：下单后创建 PENDING 流水（V1 两段式的第一段），不动订单状态。
 *  不做缓存失效：返回的流水由调用方（收银台）直接消费，且此步不改变任何已缓存查询
 *  （订单状态推进在 confirmPayment，由 useConfirmPayment 失效 my-orders / order-detail）。 */
export function useCreatePayment() {
    return useMutation({
        mutationFn: (orderId: string) => createPayment(orderId),
        onError: (err) => notify.fromError(err, "发起支付失败"),
    })
}

/** 确认支付：模拟网关回调，PENDING → SUCCESS + 推进订单；成功后失效订单缓存 */
export function useConfirmPayment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (paymentId: string) => confirmPayment(paymentId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["my-orders"] })
            qc.invalidateQueries({ queryKey: ["order-detail"] })
        },
        onError: (err) => notify.fromError(err, "确认支付失败"),
    })
}
