import { useCreateCheckoutPayment, useConfirmCheckoutPayment } from "#/checkout"
import { useT } from "#/locales/use-t"
import { orderDetailOptions } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useSuspenseQueries } from "@tanstack/react-query"
import { Wallet, CheckCircle2 } from "lucide-react"

import { sumMoney, type Money } from "@shop/common/domain"
import { Card, CardContent, Spinner, Button, Separator } from "@shop/ui-web"

import { Price } from "#/shared/ui/Price"
import { z } from "zod"

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

    const total = sumMoney(details.map((d) => d.payAmount))

    const startPay = () =>
        create.mutate(checkoutKey, { onSuccess: () => confirm.mutate(checkoutKey) })

    const goOrders = () => void navigate({ to: "/account/orders" })

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
                        details={details}
                        total={total}
                        onPay={startPay}
                        onGoOrders={goOrders}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

function PayPhaseView({
    phase,
    details,
    total,
    onPay,
    onGoOrders,
}: {
    phase: PayPhase
    details: { orderNo: string; payAmount: Money }[]
    total: Money
    onPay: () => void
    onGoOrders: () => void
}) {
    const t = useT()
    if (phase === "paying") return <PayPending />
    if (phase === "success") return <PayDone onGoOrders={onGoOrders} />
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
                ]}
            />
        )
    }
    return (
        <PayReady
            details={details}
            total={total}
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
    details,
    total,
    onPay,
    onGoOrders,
}: {
    details: { orderNo: string; payAmount: Money }[]
    total: Money
    onPay: () => void
    onGoOrders: () => void
}) {
    const t = useT()
    return (
        <>
            <Wallet className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("pay.cashier.title")}</h2>
            <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                {details.map((d) => (
                    <li
                        key={d.orderNo}
                        className="flex items-center justify-between gap-4"
                    >
                        <span>{t("pay.cashier.orderNo", { orderNo: d.orderNo })}</span>
                        <Price
                            value={d.payAmount}
                            className="text-foreground"
                        />
                    </li>
                ))}
            </ul>
            <Separator className="my-3" />
            <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("cart.settlement.total")}</span>
                <Price
                    value={total}
                    className="text-2xl font-bold text-foreground"
                />
            </div>
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

function PayDone({ onGoOrders }: { onGoOrders: () => void }) {
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
