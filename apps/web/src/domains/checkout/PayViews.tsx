import { Wallet, CheckCircle2 } from "lucide-react"

import { useT } from "#/locales/use-t"

import { type Money } from "@shop/common/domain"
import { Card, CardContent, Spinner, Button, Separator } from "@shop/ui-web"

import { Price } from "#/shared/ui/Price"

export type PayLine = { orderNo: string; payAmount: Money }

export type PayPhase = "ready" | "paying" | "success" | "confirm-error" | "create-error"

type MutationState = { isPending: boolean; isSuccess: boolean; isError: boolean }

export function payPhaseOf(create: MutationState, confirm: MutationState): PayPhase {
    if (confirm.isSuccess) return "success"
    if (confirm.isError) return "confirm-error"
    if (create.isError) return "create-error"
    if (create.isPending || confirm.isPending) return "paying"
    return "ready"
}

export function PayShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-page-center flex-col items-center justify-center px-6">
            <Card className="w-full max-w-md text-center">
                <CardContent>{children}</CardContent>
            </Card>
        </div>
    )
}

export function PaySkeleton() {
    const t = useT()
    return (
        <PayShell>
            <Spinner className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("pay.loading.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("pay.loading.body")}</p>
        </PayShell>
    )
}

export function PayPhaseView({
    phase,
    lines,
    total,
    onPay,
    onGoOrders,
    onGoDetail,
}: {
    phase: PayPhase
    lines: PayLine[]
    total: Money
    onPay: () => void
    onGoOrders: () => void
    onGoDetail?: () => void
}) {
    const t = useT()
    if (phase === "paying") return <PayPending />
    if (phase === "success") {
        return (
            <PayDone
                onGoOrders={onGoOrders}
                onGoDetail={onGoDetail}
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
        const buttons: { text: string; onClick: () => void; variant: "cta" | "outline" }[] = [
            { text: t("pay.action.backToOrders"), onClick: onGoOrders, variant: "cta" },
        ]
        if (onGoDetail) {
            buttons.push({
                text: t("pay.action.viewDetail"),
                onClick: onGoDetail,
                variant: "outline",
            })
        }
        return (
            <PayFailed
                title={t("pay.failure.notEffective.title")}
                hint={t("pay.failure.notEffective.body")}
                buttons={buttons}
            />
        )
    }
    return (
        <PayReady
            lines={lines}
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
    lines,
    total,
    onPay,
    onGoOrders,
}: {
    lines: PayLine[]
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
                {lines.map((line) => (
                    <li
                        key={line.orderNo}
                        className="flex items-center justify-between gap-4"
                    >
                        <span>{t("pay.cashier.orderNo", { orderNo: line.orderNo })}</span>
                        <Price
                            value={line.payAmount}
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

function PayDone({ onGoOrders, onGoDetail }: { onGoOrders: () => void; onGoDetail?: () => void }) {
    const t = useT()
    return (
        <>
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("pay.success.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("pay.success.body")}</p>
            <div className="mt-6 flex flex-col gap-3">
                {onGoDetail ? (
                    <>
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
                    </>
                ) : (
                    <Button
                        variant="cta"
                        className="h-11 w-full"
                        onClick={onGoOrders}
                    >
                        {t("pay.action.backToOrders")}
                    </Button>
                )}
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
