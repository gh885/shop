import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { PaymentsApi } from "@shop/api/sdk"
import type { OrderLineRequest } from "@shop/api/sdk"

import { couponIdsOf, type CheckoutPreview, type CouponSelection } from "./rules"
import { toCheckoutPreview } from "./mapper"
import { createOrder, fetchPreview, orderKeys } from "#/domains/order"
import { cartKeys } from "#/domains/cart"
import { couponKeys } from "#/domains/coupon"

const checkoutKeys = {
    all: ["checkout-preview"] as const,
    preview: (sourceId: string, addressId: string, couponIds: string) =>
        [...checkoutKeys.all, sourceId, addressId, couponIds] as const,
}

export type CheckoutSource = { lines: OrderLineRequest[] }

const sourceKey = (s: CheckoutSource) => s.lines.map((l) => `${l.skuId}:${l.quantity}`).join(",")

export const checkoutPreviewOptions = ({
    source,
    addressId,
    coupons,
}: {
    source: CheckoutSource
    addressId?: string
    coupons?: CouponSelection
}) => {
    const userCouponIds = couponIdsOf(coupons ?? {})
    return queryOptions({
        queryKey: checkoutKeys.preview(sourceKey(source), addressId ?? "", userCouponIds.join(",")),
        queryFn: async (): Promise<CheckoutPreview> => {
            const res = await fetchPreview({
                lines: source.lines,
                addressId,
                userCouponIds,
            })
            return toCheckoutPreview(res)
        },
        enabled: source.lines.length > 0,
        staleTime: 0,
        retry: false,
        placeholderData: (prev) => prev,
        throwOnError: false,
    })
}

export function useCreateOrder() {
    return useMutation({
        mutationFn: (args: {
            checkoutKey: string
            addressId: string
            source: CheckoutSource
            coupons?: CouponSelection
            buyerMessage?: string
        }) =>
            createOrder({
                checkoutKey: args.checkoutKey,
                addressId: args.addressId,
                lines: args.source.lines,
                userCouponIds: couponIdsOf(args.coupons ?? {}),
                buyerMessage: args.buyerMessage,
            }),
        meta: {
            success: message("checkout.toast.orderPlaced"),
            error: message("checkout.toast.orderFailed"),
            invalidates: [orderKeys.trades, cartKeys.all, couponKeys.mine],
        },
    })
}

/** 发起支付：按主订单，一次结算的全部子订单一起建流水（后端按子订单各记一条） */
export function useCreatePayment() {
    return useMutation({
        mutationFn: (tradeId: string) => PaymentsApi.createPayment({ body: { tradeId } }),
        meta: { error: message("checkout.toast.payInitFailed") },
    })
}

/** 确认整张主订单：逐条 PENDING → SUCCESS 并推进子订单，全部付清才落到已支付 */
export function useConfirmTrade() {
    return useMutation({
        mutationFn: (tradeId: string) => PaymentsApi.confirmTrade({ path: { tradeId } }),
        meta: {
            success: message("checkout.toast.paySuccess"),
            error: message("checkout.toast.payConfirmFailed"),
            invalidates: [orderKeys.all],
        },
    })
}

/** 单条流水确认：渠道回跳时只有 out_trade_no（= 流水 id），按它查真相 */
export function useConfirmPayment() {
    return useMutation({
        mutationFn: (paymentId: string) => PaymentsApi.confirmPayment({ path: { id: paymentId } }),
        meta: {
            success: message("checkout.toast.paySuccess"),
            error: message("checkout.toast.payConfirmFailed"),
            invalidates: [orderKeys.all],
        },
    })
}
