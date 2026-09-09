import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { notify } from "@shop/app-kit"

import { toCheckoutPreview, type CheckoutPreview } from "./checkout"
import {
    confirmPayment,
    createOrder,
    createPayment,
    fetchPreview,
    MY_ORDERS_KEY,
    ORDER_DETAIL_KEY,
} from "#/order/queries"
import { CART_COUNT_KEY, CART_ITEMS_KEY } from "#/cart/queries"

/** checkout/queries —— 结算预览与下单/支付的 React 接线层。规则/类型在 ./checkout.ts。 */

/** 结算行：skuId + 件数。购物车勾选与立即购买在入口处归约成同一形状，后端不再区分来源 */
export type CheckoutLine = { skuId: string; quantity: number }

/** 结算来源：一组结算行（URL search 携带，刷新可复现） */
export type CheckoutSource = { lines: CheckoutLine[] }

const sourceKey = (s: CheckoutSource) => s.lines.map((l) => `${l.skuId}:${l.quantity}`).join(",")

/** 结算预览：以来源为 key；地址切换 → 新 key 重新预览，避免手动 refetch */
export function useCheckoutPreview({
    source,
    addressId,
}: {
    source: CheckoutSource
    addressId?: string
}) {
    const enabled = source.lines.length > 0
    return useQuery({
        queryKey: ["checkout-preview", sourceKey(source), addressId ?? ""] as const,
        queryFn: async (): Promise<CheckoutPreview> => {
            const res = await fetchPreview({ lines: source.lines, addressId })
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
                lines: args.source.lines,
                buyerMessage: args.buyerMessage,
            }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: MY_ORDERS_KEY })
            void qc.invalidateQueries({ queryKey: CART_ITEMS_KEY }) // 后端 OrderPlacedEvent 已删已购 SKU 的条目，缓存随之失效
            void qc.invalidateQueries({ queryKey: CART_COUNT_KEY })
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
            void qc.invalidateQueries({ queryKey: MY_ORDERS_KEY })
            void qc.invalidateQueries({ queryKey: ORDER_DETAIL_KEY })
        },
        onError: (err) => notify.fromError(err, "确认支付失败"),
    })
}
