import {
    useConfirmPayment,
    PaySkeleton,
    PayShell,
    PayPhaseView,
    payPhaseOf,
} from "#/domains/checkout"
import { orderDetailOptions, orderKeys } from "#/domains/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query"

import { BuyerOrderControllerApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"

/**
 * 收银台按<b>订单组</b>（一次结算）：
 *
 * <p>一次结算只付一次钱——子订单是平台内部按店拆的账，买家不该看到「付三次」。
 * `POST /buyer/orders/{orderGroupId}/pay` 建流水并返回 `PaymentView`；MOCK 渠道没有跳转地址，
 * 拿到 paymentId 直接确认；真实渠道先跳 payUrl，回来再确认。
 */
export const Route = createFileRoute("/_authenticated/pay/$tradeId")({
    /** 订单组详情在 loader 读完再渲染（收银台不能拿一份可能过期的金额去收钱） */
    preloadStaleTime: 0,
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient
            .query(orderDetailOptions(params.tradeId, 0))
            .catch((error: unknown) => {
                if (toApiError(error).status === 404) throw notFound()
                throw error
            })
    },
    pendingComponent: PaySkeleton,
    component: PayPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.cashier", match.context.locale) }],
    }),
})

function PayPage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { tradeId } = Route.useParams()
    const order = useSuspenseQuery(orderDetailOptions(tradeId)).data

    // 一次 pay 一条流水：PaymentView 直接就是 pay 的响应，不需要先建后查
    const pay = useMutation({
        mutationFn: () => BuyerOrderControllerApi.pay({ path: { orderGroupId: tradeId } }),
    })
    const confirm = useConfirmPayment()

    const startPay = () =>
        pay.mutate(undefined, {
            onSuccess: (payment) => {
                if (payment.payUrl) {
                    window.location.assign(payment.payUrl)
                    return
                }
                confirm.mutate(payment.paymentId, {
                    onSuccess: () =>
                        void queryClient.invalidateQueries({ queryKey: orderKeys.all }),
                })
            },
        })

    return (
        <PayShell>
            <PayPhaseView
                phase={payPhaseOf(pay, confirm)}
                lines={order.orders.map((sellerOrder) => ({
                    orderNo: sellerOrder.orderNo,
                    payAmount: sellerOrder.payAmount,
                }))}
                total={order.payAmount}
                onPay={startPay}
                onGoOrders={() => void navigate({ to: "/account/orders" })}
            />
        </PayShell>
    )
}
