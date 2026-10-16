import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { PaymentsApi } from "@shop/api/sdk"
import type { OrderLineRequest } from "@shop/api/sdk"

import { couponIdsOf, type CheckoutPreview, type CouponSelection } from "./checkout"
import { toCheckoutPreview } from "./mapper"
import { createOrder, fetchPreview, MY_ORDERS_KEY, ORDER_DETAIL_KEY } from "#/order"
import { CART_COUNT_KEY, CART_ITEMS_KEY } from "#/cart"
import { MY_COUPONS_KEY } from "#/coupon"

const CHECKOUT_PREVIEW_KEY = ["checkout-preview"] as const

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
        queryKey: [
            ...CHECKOUT_PREVIEW_KEY,
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
        enabled: source.lines.length > 0,
        staleTime: 0,
        retry: false,
        placeholderData: (prev) => prev,
        throwOnError: false,
    })
}

export function useCreateOrder() {
    const [checkoutKey] = useState(() => crypto.randomUUID())
    return useMutation({
        mutationFn: (args: {
            addressId: string
            source: CheckoutSource
            coupons?: CouponSelection
            buyerMessage?: string
        }) =>
            createOrder({
                checkoutKey,
                addressId: args.addressId,
                lines: args.source.lines,
                userCouponIds: couponIdsOf(args.coupons ?? {}),
                buyerMessage: args.buyerMessage,
            }),
        meta: {
            success: message("checkout.toast.orderPlaced"),
            error: message("checkout.toast.orderFailed"),
            invalidates: [MY_ORDERS_KEY, CART_ITEMS_KEY, CART_COUNT_KEY, MY_COUPONS_KEY],
        },
    })
}

export function useCreatePayment() {
    return useMutation({
        mutationFn: (orderId: string) => PaymentsApi.createPayment({ body: { orderId } }),
        meta: { error: message("checkout.toast.payInitFailed") },
    })
}

export function useConfirmPayment() {
    return useMutation({
        mutationFn: (paymentId: string) => PaymentsApi.confirmPayment({ path: { id: paymentId } }),
        meta: {
            success: message("checkout.toast.paySuccess"),
            error: message("checkout.toast.payConfirmFailed"),
            invalidates: [MY_ORDERS_KEY, ORDER_DETAIL_KEY],
        },
    })
}
