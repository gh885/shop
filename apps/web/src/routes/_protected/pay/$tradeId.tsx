import {
    useCreatePayment,
    useConfirmTrade,
    PaySkeleton,
    PayShell,
    PayPhaseView,
    payPhaseOf,
} from "#/checkout"
import { tradeDetailOptions } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useSuspenseQuery } from "@tanstack/react-query"

import { toApiError } from "@shop/common/contract"

/**
 * 收银台按<b>主订单</b>（一次结算）：
 *
 * <p>一次结算只付一次钱——子订单是平台内部按店拆的账，买家不该看到「付三次」。金额与拆单明细都由
 * {@code GET /orders/trades/{id}} 给出（与列表卡片同一形状），扣款也一律按主订单，前端不报价、不报单号。
 */
export const Route = createFileRoute("/_protected/pay/$tradeId")({
    /** 主订单详情在 loader 读完再渲染（收银台不能拿一份可能过期的金额去收钱） */
    preloadStaleTime: 0,
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient
            .query(tradeDetailOptions(params.tradeId, 0))
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
    const { tradeId } = Route.useParams()
    const trade = useSuspenseQuery(tradeDetailOptions(tradeId)).data
    const create = useCreatePayment()
    const confirm = useConfirmTrade()

    const startPay = () =>
        create.mutate(tradeId, {
            onSuccess: (batch) => {
                // 真实渠道：先跳去收银台付款，回来再由 /pay/return 查询确认；MOCK 没有跳转地址，直接确认
                const payUrl = batch.payments.find((p) => p.payUrl)?.payUrl
                if (payUrl) {
                    window.location.assign(payUrl)
                    return
                }
                confirm.mutate(tradeId)
            },
        })

    return (
        <PayShell>
            <PayPhaseView
                phase={payPhaseOf(create, confirm)}
                lines={trade.orders.map((order) => ({
                    orderNo: order.orderNo,
                    payAmount: order.payAmount,
                }))}
                total={trade.payAmount}
                onPay={startPay}
                onGoOrders={() => void navigate({ to: "/account/orders" })}
            />
        </PayShell>
    )
}
