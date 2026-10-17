import {
    useCreateCheckoutPayment,
    useConfirmCheckoutPayment,
    PaySkeleton,
    PayShell,
    PayPhaseView,
    payPhaseOf,
} from "#/checkout"
import { orderDetailOptions } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useSuspenseQueries } from "@tanstack/react-query"
import { z } from "zod"

import { sumMoney } from "@shop/common/domain"

const paySearchSchema = z.object({
    // 展示用的订单号：仅渲染各子单与合计；真实扣款一律按 checkoutKey 由后端反查（不信任这里）
    orders: z.array(z.string()).catch([]),
})

export const Route = createFileRoute("/_protected/pay/$checkoutKey")({
    validateSearch: (search: Record<string, unknown>) => paySearchSchema.parse(search),
    pendingComponent: PaySkeleton,
    component: PayPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.cashier", match.context.locale) }],
    }),
})

function PayPage() {
    const navigate = useNavigate()
    const { checkoutKey } = Route.useParams()
    const { orders } = Route.useSearch()
    // 收银台只能从下单成功进入；手打/丢失订单号则视为无此收银台（真实扣款仍只认 checkoutKey）
    if (orders.length === 0) throw notFound()
    const results = useSuspenseQueries({
        queries: orders.map((orderId) => orderDetailOptions(orderId, 0)),
    })
    const details = results.map((r) => r.data)
    const create = useCreateCheckoutPayment()
    const confirm = useConfirmCheckoutPayment()

    // 合并支付目前只支持 MOCK 渠道：真实渠道一笔交易对一个 out_trade_no，整批请逐单支付（后端会 400）
    const startPay = () =>
        create.mutate(checkoutKey, { onSuccess: () => confirm.mutate(checkoutKey) })

    return (
        <PayShell>
            <PayPhaseView
                phase={payPhaseOf(create, confirm)}
                lines={details.map((d) => ({ orderNo: d.orderNo, payAmount: d.payAmount }))}
                total={sumMoney(details.map((d) => d.payAmount))}
                onPay={startPay}
                onGoOrders={() => void navigate({ to: "/account/orders" })}
            />
        </PayShell>
    )
}
