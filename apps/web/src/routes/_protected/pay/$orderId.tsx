import {
    useCreatePayment,
    useConfirmPayment,
    PaySkeleton,
    PayShell,
    PayPhaseView,
    payPhaseOf,
} from "#/checkout"
import { orderDetailOptions } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useSuspenseQuery } from "@tanstack/react-query"

import { toApiError } from "@shop/common/contract"

export const Route = createFileRoute("/_protected/pay/$orderId")({
    /** 订单详情在 loader 读完再渲染（收银台不能拿一份可能过期的金额去收钱） */
    preloadStaleTime: 0,
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient
            .query(orderDetailOptions(params.orderId, 0))
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
    const { orderId } = Route.useParams()
    const order = useSuspenseQuery(orderDetailOptions(orderId)).data
    const create = useCreatePayment()
    const confirm = useConfirmPayment()

    const startPay = () =>
        create.mutate(orderId, {
            onSuccess: (payment) => {
                // 真实渠道：先跳去收银台付款，回来再由 /pay/return 查询确认；MOCK 没有跳转地址，直接确认
                if (payment.payUrl) {
                    window.location.assign(payment.payUrl)
                    return
                }
                confirm.mutate(payment.id)
            },
        })

    return (
        <PayShell>
            <PayPhaseView
                phase={payPhaseOf(create, confirm)}
                lines={[{ orderNo: order.orderNo, payAmount: order.payAmount }]}
                total={order.payAmount}
                onPay={startPay}
                onGoOrders={() => void navigate({ to: "/account/orders" })}
                onGoDetail={() => void navigate({ to: "/orders/$orderId", params: { orderId } })}
            />
        </PayShell>
    )
}
