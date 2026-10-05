import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { PaymentsApi } from "@shop/api/sdk"

import {
    couponIdsOf,
    toCheckoutPreview,
    type CheckoutPreview,
    type CouponSelection,
} from "./checkout"
import { createOrder, fetchPreview, MY_ORDERS_KEY, ORDER_DETAIL_KEY } from "#/order"
import { CART_COUNT_KEY, CART_ITEMS_KEY } from "#/cart"
import { MY_COUPONS_KEY } from "#/coupon"

/** checkout/queries —— 结算预览与下单/支付的 React 接线层。规则/类型在 ./checkout.ts。 */

/** 结算预览缓存前缀（key 工厂留在域内，不外流）：地址/选券/结算行都是它的后缀段 */
const CHECKOUT_PREVIEW_KEY = ["checkout-preview"] as const

/** 结算行：skuId + 件数。购物车勾选与立即购买在入口处归约成同一形状，后端不再区分来源 */
type CheckoutLine = { skuId: string; quantity: number }

/** 结算来源：一组结算行（URL search 携带，刷新可复现） */
export type CheckoutSource = { lines: CheckoutLine[] }

const sourceKey = (s: CheckoutSource) => s.lines.map((l) => `${l.skuId}:${l.quantity}`).join(",")

/** 结算预览：以来源 + 地址 + 每店选中的券为 key；任何一项变化都走新 key 重新预览，
 *  不手动 refetch —— 换券必须重算，这正是「预览价 ≠ 实付价」的来源。
 *  组件直接 `useQuery(checkoutPreviewOptions({ source, addressId, coupons }))`。 */
export const checkoutPreviewOptions = ({
    source,
    addressId,
    coupons,
}: {
    source: CheckoutSource
    addressId?: string
    /** 每店选中的券；不传 = 本次预览不用券 */
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
        // 没有结算行就没什么可预览的：不开查询，而不是发了再丢掉
        enabled: source.lines.length > 0,
        staleTime: 0,
        retry: false,
        // 换券/换地址都是新 key：保留上一份预览继续展示，否则整页会闪回骨架屏，
        // 正在选券的 Popover 也会被卸载 —— 换券是把价格重算一遍，不是重新进一次结算页。
        placeholderData: (prev) => prev,
        // 退出全局的「失败抛给错误边界」：预览是页面里的价格面板，页面自己就地渲染了重试块。
        // 抛出去会连地址选择一起换掉，
        // 用户刚选的地址与券就没了
        throwOnError: false,
    })
}

/** 创建订单：一次结算按店拆 N 单，全成全败；成功后由调用方跳转支付。
 *  checkoutKey 随结算页挂载生成一次：双击与网络超时后的重试都带同一个键，后端撞键回放原单、不重复冻结库存；
 *  重新进入结算页 = 新一次结算 = 新键。
 *  选中的券随单提交（后端不接受选了却不可用的券，UI 上只允许勾可用券）。 */
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
        // 后端 OrderPlacedEvent 已删已购 SKU 的条目，购物车与角标一起失效；
        // 所选券被本单核销，券包不失效就还能在钱包页看到它「未使用」
        meta: {
            success: message("web.checkout.toast.orderPlaced"),
            error: message("web.checkout.toast.orderFailed"),
            invalidates: [MY_ORDERS_KEY, CART_ITEMS_KEY, CART_COUNT_KEY, MY_COUPONS_KEY],
        },
    })
}

/** 发起支付：下单后创建 PENDING 流水（V1 两段式的第一段），不动订单状态。
 *  不做缓存失效：返回的流水由调用方（收银台）直接消费，且此步不改变任何已缓存查询
 *  （订单状态推进在确认支付，由 useConfirmPayment 失效 my-orders / order-detail）。 */
export function useCreatePayment() {
    return useMutation({
        // 发起支付：V1 创建 PENDING 流水（不动订单状态），返回待确认流水
        mutationFn: (orderId: string) => PaymentsApi.createPayment({ body: { orderId } }),
        // 不提示成功（meta.success 不填即静默）：调用方拿到流水会立刻 confirm（收银台一次点按串两段），
        // 这里弹「已发起」紧接着又弹「支付成功」，是两条互相覆盖的提示
        meta: { error: message("web.checkout.toast.payInitFailed") },
    })
}

/** 确认支付：模拟网关回调，PENDING → SUCCESS + 推进订单；成功后失效订单缓存 */
export function useConfirmPayment() {
    return useMutation({
        mutationFn: (paymentId: string) => PaymentsApi.confirmPayment({ path: { id: paymentId } }),
        meta: {
            success: message("web.checkout.toast.paySuccess"),
            error: message("web.checkout.toast.payConfirmFailed"),
            invalidates: [MY_ORDERS_KEY, ORDER_DETAIL_KEY],
        },
    })
}
