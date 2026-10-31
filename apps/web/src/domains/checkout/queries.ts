import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"

import {
    BuyerOrderControllerApi,
    BuyerPaymentControllerApi,
    QuoteControllerApi,
} from "@shop/api/sdk"
import type { OrderLine } from "@shop/api/sdk"

/** 结算入参行：与 `QuoteLine` 同形（不含 lineNo，提交时按序补上） */
export type CheckoutLineInput = Omit<OrderLine, "lineNo">

import { toCheckoutPreview } from "./mapper"
import type { CheckoutPreview } from "./rules"
import { orderKeys } from "#/domains/order"
import { cartKeys } from "#/domains/cart"

const checkoutKeys = {
    all: ["checkout-preview"] as const,
    preview: (sourceId: string) => [...checkoutKeys.all, sourceId] as const,
}

export type CheckoutSource = { lines: CheckoutLineInput[] }

const sourceKey = (s: CheckoutSource) =>
    s.lines.map((l) => `${l.skuId}:${l.listingId}:${l.quantity}`).join(",")

/**
 * 结算预览 = 询价（quote）。
 *
 * <p>新契约没有「预览」端点，`POST /buyer/quotes` 就是预览：服务端按行算商品额、运费、
 * 优惠与不可购行，给出 `quoteId` 供下单时回传。quote 里没有优惠券字段——券功能后端未落地。
 *
 * <p><b>询价必须带着选中的地址</b>：落单时服务端拿地址簿快照的区划码重新询价并与报价单对
 * 指纹（TradeService「与算价时同源」），地址不在指纹里的报价单必被 PRICE_CHANGED 打回。
 * 派生规则与后端 AddressView 一致：省码取前 2 位、市码取前 4 位、区码原样。换地址即换 key 重询。
 */
export const addressCodesOf = (regionCode: string) => ({
    provinceCode: regionCode.slice(0, 2),
    cityCode: regionCode.slice(0, 4),
    districtCode: regionCode,
})

export const checkoutPreviewOptions = ({
    source,
    regionCode,
}: {
    source: CheckoutSource
    regionCode: string | undefined
}) =>
    queryOptions({
        queryKey: checkoutKeys.preview(`${sourceKey(source)}:${regionCode ?? "none"}`),
        queryFn: async ({ signal }): Promise<CheckoutPreview> =>
            toCheckoutPreview(
                await QuoteControllerApi.quote({
                    // QuoteLine.lineNo 从 1 起编：询价与下单用同一份行序，服务端按行号对账
                    body: {
                        address: regionCode ? addressCodesOf(regionCode) : undefined,
                        lines: source.lines.map((line, index) => ({ ...line, lineNo: index + 1 })),
                    },
                    signal,
                }),
            ),
    })

/** 下单必须带 quoteId：金额以服务端询价为准，前端不报价 */
export function useCreateOrder() {
    return useMutation({
        mutationFn: (args: { quoteId: string; addressId: string; lines: OrderLine[] }) =>
            BuyerOrderControllerApi.place({
                body: {
                    quoteId: args.quoteId,
                    addressId: args.addressId,
                    lines: args.lines,
                },
            }),
        meta: {
            success: message("checkout.toast.orderPlaced"),
            error: message("checkout.toast.orderFailed"),
            invalidates: [orderKeys.trades, cartKeys.all],
        },
    })
}

/** 确认一条支付流水：MOCK 渠道直接确认；真实渠道由渠道回跳触发（out_trade_no = paymentId） */
export function useConfirmPayment() {
    return useMutation({
        mutationFn: (paymentId: string) =>
            BuyerPaymentControllerApi.confirm({ path: { paymentId } }),
        meta: {
            success: message("checkout.toast.paySuccess"),
            error: message("checkout.toast.payConfirmFailed"),
            invalidates: [orderKeys.all],
        },
    })
}
