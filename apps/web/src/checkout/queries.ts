import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { useWriteMutation } from "@shop/app-kit"
import { PaymentsApi, type PaymentResponse } from "@shop/api/sdk"

import {
    couponIdsOf,
    toCheckoutPreview,
    type CheckoutPreview,
    type CouponSelection,
} from "./checkout"
import { createOrder, fetchPreview, MY_ORDERS_KEY, ORDER_DETAIL_KEY } from "#/order/queries"
import { CART_COUNT_KEY, CART_ITEMS_KEY } from "#/cart/queries"

/** checkout/queries —— 结算预览与下单/支付的 React 接线层。规则/类型在 ./checkout.ts。 */

/** 结算行：skuId + 件数。购物车勾选与立即购买在入口处归约成同一形状，后端不再区分来源 */
type CheckoutLine = { skuId: string; quantity: number }

/** 结算来源：一组结算行（URL search 携带，刷新可复现） */
export type CheckoutSource = { lines: CheckoutLine[] }

const sourceKey = (s: CheckoutSource) => s.lines.map((l) => `${l.skuId}:${l.quantity}`).join(",")

/** 结算预览：以来源 + 地址 + 每店选中的券为 key；任何一项变化都走新 key 重新预览，
 *  不手动 refetch —— 换券必须重算，这正是「预览价 ≠ 实付价」的来源。 */
export function useCheckoutPreview({
    source,
    addressId,
    coupons,
}: {
    source: CheckoutSource
    addressId?: string
    /** 每店选中的券；不传 = 本次预览不用券 */
    coupons?: CouponSelection
}) {
    const enabled = source.lines.length > 0
    const userCouponIds = couponIdsOf(coupons ?? {})
    return useQuery({
        queryKey: [
            "checkout-preview",
            sourceKey(source),
            addressId ?? "",
            userCouponIds.join(","),
        ] as const,
        queryFn: async (): Promise<CheckoutPreview> => {
            const res = await fetchPreview({
                lines: source.lines,
                addressId,
                userCouponIds,
            })
            return toCheckoutPreview(res)
        },
        enabled,
        staleTime: 0,
        retry: false,
        // 换券/换地址都是新 key：保留上一份预览继续展示，否则整页会闪回骨架屏，
        // 正在选券的 Popover 也会被卸载 —— 换券是把价格重算一遍，不是重新进一次结算页。
        placeholderData: (prev) => prev,
    })
}

/** 创建订单：一次结算按店拆 N 单，全成全败；成功后由调用方跳转支付。
 *  checkoutKey 随结算页挂载生成一次：双击与网络超时后的重试都带同一个键，后端撞键回放原单、不重复冻结库存；
 *  重新进入结算页 = 新一次结算 = 新键。
 *  选中的券随单提交（后端不接受选了却不可用的券，UI 上只允许勾可用券）。 */
export function useCreateOrder() {
    const qc = useQueryClient()
    const [checkoutKey] = useState(() => crypto.randomUUID())
    return useWriteMutation<
        {
            addressId: string
            source: CheckoutSource
            coupons?: CouponSelection
            buyerMessage?: string
        },
        // 显式给出 data 泛型：调用方在 mutate 的 onSuccess 里读 res.orders（拆单结果）
        Awaited<ReturnType<typeof createOrder>>
    >({
        mutationFn: (args) =>
            createOrder({
                checkoutKey,
                addressId: args.addressId,
                lines: args.source.lines,
                userCouponIds: couponIdsOf(args.coupons ?? {}),
                buyerMessage: args.buyerMessage,
            }),
        invalidate: () => {
            void qc.invalidateQueries({ queryKey: MY_ORDERS_KEY })
            void qc.invalidateQueries({ queryKey: CART_ITEMS_KEY }) // 后端 OrderPlacedEvent 已删已购 SKU 的条目，缓存随之失效
            void qc.invalidateQueries({ queryKey: CART_COUNT_KEY })
        },
        messages: { success: "下单成功", error: "下单失败" },
    })
}

/** 发起支付：下单后创建 PENDING 流水（V1 两段式的第一段），不动订单状态。
 *  不做缓存失效：返回的流水由调用方（收银台）直接消费，且此步不改变任何已缓存查询
 *  （订单状态推进在确认支付，由 useConfirmPayment 失效 my-orders / order-detail）。 */
export function useCreatePayment() {
    return useWriteMutation<string, PaymentResponse>({
        // 发起支付：V1 创建 PENDING 流水（不动订单状态），返回待确认流水
        mutationFn: (orderId) => PaymentsApi.createPayment({ body: { orderId } }),
        // 不提示成功：调用方拿到流水会立刻 confirm（收银台一次点按串两段），
        // 这里弹「已发起」紧接着又弹「支付成功」，是两条互相覆盖的提示
        silentSuccess: true,
        messages: { error: "发起支付失败" },
    })
}

/** 确认支付：模拟网关回调，PENDING → SUCCESS + 推进订单；成功后失效订单缓存 */
export function useConfirmPayment() {
    const qc = useQueryClient()
    return useWriteMutation<string, PaymentResponse>({
        mutationFn: (paymentId) => PaymentsApi.confirmPayment({ path: { id: paymentId } }),
        invalidate: () => {
            void qc.invalidateQueries({ queryKey: MY_ORDERS_KEY })
            void qc.invalidateQueries({ queryKey: ORDER_DETAIL_KEY })
        },
        messages: { success: "支付成功", error: "确认支付失败" },
    })
}
