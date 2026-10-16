import { useCreatePayment, useConfirmPayment } from "#/checkout"
import { useT } from "#/locales/use-t"
import { orderDetailOptions } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Wallet, CheckCircle2 } from "lucide-react"

import { toApiError } from "@shop/common/contract"
import { type Money } from "@shop/common/domain"
import { Card, CardContent, Spinner, Button } from "@shop/ui-web"

import { Price } from "#/shared/ui/Price"

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

function PaySkeleton() {
    const t = useT()
    return (
        <div className="flex min-h-page-center flex-col items-center justify-center px-6">
            <Card className="w-full max-w-md text-center">
                <CardContent>
                    <Spinner className="mx-auto size-12 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold text-foreground">
                        {t("pay.loading.title")}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">{t("pay.loading.body")}</p>
                </CardContent>
            </Card>
        </div>
    )
}

type PayPhase = "ready" | "paying" | "success" | "confirm-error" | "create-error"

function PayPage() {
    const navigate = useNavigate()
    const { orderId } = Route.useParams()
    const order = useSuspenseQuery(orderDetailOptions(orderId)).data
    const create = useCreatePayment()
    const confirm = useConfirmPayment()

    const startPay = () =>
        create.mutate(orderId, { onSuccess: (payment) => confirm.mutate(payment.id) })

    const goOrders = () => void navigate({ to: "/account/orders" })
    const goDetail = () => void navigate({ to: "/orders/$orderId", params: { orderId } })

    const phase: PayPhase = confirm.isSuccess
        ? "success"
        : confirm.isError
          ? "confirm-error"
          : create.isError
            ? "create-error"
            : create.isPending || confirm.isPending
              ? "paying"
              : "ready"

    return (
        <div className="flex min-h-page-center flex-col items-center justify-center px-6">
            <Card className="w-full max-w-md text-center">
                <CardContent>
                    <PayPhaseView
                        phase={phase}
                        orderNo={order.orderNo}
                        payAmount={order.payAmount}
                        onPay={startPay}
                        onGoOrders={goOrders}
                        onGoDetail={goDetail}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

function PayPhaseView({
    phase,
    orderNo,
    payAmount,
    onPay,
    onGoOrders,
    onGoDetail,
}: {
    phase: PayPhase
    orderNo: string
    payAmount: Money
    onPay: () => void
    onGoOrders: () => void
    onGoDetail: () => void
}) {
    const t = useT()
    if (phase === "paying") return <PayPending />
    if (phase === "success") {
        return (
            <PayDone
                onGoDetail={onGoDetail}
                onGoOrders={onGoOrders}
            />
        )
    }
    if (phase === "create-error") {
        return (
            <PayFailed
                title={t("pay.failure.payFailed.title")}
                hint={t("pay.failure.payFailed.body")}
                buttons={[
                    { text: t("pay.failure.payFailed.retry"), onClick: onPay, variant: "cta" },
                    {
                        text: t("pay.action.backToOrders"),
                        onClick: onGoOrders,
                        variant: "outline",
                    },
                ]}
            />
        )
    }
    if (phase === "confirm-error") {
        return (
            <PayFailed
                title={t("pay.failure.notEffective.title")}
                hint={t("pay.failure.notEffective.body")}
                buttons={[
                    { text: t("pay.action.backToOrders"), onClick: onGoOrders, variant: "cta" },
                    {
                        text: t("pay.action.viewDetail"),
                        onClick: onGoDetail,
                        variant: "outline",
                    },
                ]}
            />
        )
    }
    return (
        <PayReady
            orderNo={orderNo}
            payAmount={payAmount}
            onPay={onPay}
            onGoOrders={onGoOrders}
        />
    )
}

function PayPending() {
    const t = useT()
    return (
        <>
            <Spinner className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("pay.paying.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("pay.paying.body")}</p>
        </>
    )
}

function PayReady({
    orderNo,
    payAmount,
    onPay,
    onGoOrders,
}: {
    orderNo: string
    payAmount: Money
    onPay: () => void
    onGoOrders: () => void
}) {
    const t = useT()
    return (
        <>
            <Wallet className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("pay.cashier.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
                {t("pay.cashier.orderNo", { orderNo })}
            </p>
            <Price
                value={payAmount}
                className="mt-4 text-4xl font-bold text-foreground"
            />
            <p className="mt-2 text-xs text-muted-foreground">{t("pay.cashier.mockNotice")}</p>

            <div className="mt-6 flex flex-col gap-3">
                <Button
                    variant="cta"
                    className="h-11 w-full"
                    onClick={onPay}
                >
                    {t("pay.cashier.confirm")}
                </Button>
                <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={onGoOrders}
                >
                    {t("pay.action.backToOrders")}
                </Button>
            </div>
        </>
    )
}

function PayDone({ onGoDetail, onGoOrders }: { onGoDetail: () => void; onGoOrders: () => void }) {
    const t = useT()
    return (
        <>
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("pay.success.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("pay.success.body")}</p>
            <div className="mt-6 flex flex-col gap-3">
                <Button
                    variant="cta"
                    className="h-11 w-full"
                    onClick={onGoDetail}
                >
                    {t("pay.success.viewDetail")}
                </Button>
                <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={onGoOrders}
                >
                    {t("pay.action.backToOrders")}
                </Button>
            </div>
        </>
    )
}

function PayFailed({
    title,
    hint,
    buttons,
}: {
    title: string
    hint: string
    buttons: { text: string; onClick: () => void; variant: "cta" | "outline" }[]
}) {
    return (
        <>
            <h2 className="text-lg font-semibold text-destructive">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
            <div className="mt-6 flex flex-col gap-3">
                {buttons.map((button) => (
                    <Button
                        key={button.text}
                        variant={button.variant}
                        className="h-11 w-full"
                        onClick={button.onClick}
                    >
                        {button.text}
                    </Button>
                ))}
            </div>
        </>
    )
}
