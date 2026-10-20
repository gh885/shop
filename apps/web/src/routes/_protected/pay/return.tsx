import { PayShell, useConfirmPayment } from "#/domains/checkout"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { payReturnSearchSchema } from "#/domains/pay/search"

import { Button, Spinner } from "@shop/ui-web"

export const Route = createFileRoute("/_protected/pay/return")({
    validateSearch: payReturnSearchSchema,
    component: PayReturnPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.cashier", match.context.locale) }],
    }),
})

/**
 * 渠道回跳页：买家在支付宝付完被带回这里。
 *
 * <p>回跳参数不可信（未签名、可被手改），所以这里<b>不读</b>支付宝带来的 trade_status / total_amount，
 * 只拿 out_trade_no 作为流水主键，让后端去渠道查询真相。查询是显式按钮而不是挂载即调：
 * 服务端命令的触发源必须是用户动作（PAY-36），这样刷新页面也不会重复打渠道。
 */
function PayReturnPage() {
    const t = useT()
    const navigate = useNavigate()
    const { out_trade_no } = Route.useSearch()
    const confirm = useConfirmPayment()

    if (!out_trade_no) {
        return (
            <PayShell>
                <h2 className="text-lg font-semibold text-destructive">
                    {t("pay.return.missing.title")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("pay.return.missing.body")}</p>
                <Button
                    variant="outline"
                    className="mt-6 h-11 w-full"
                    onClick={() => void navigate({ to: "/account/orders" })}
                >
                    {t("pay.action.backToOrders")}
                </Button>
            </PayShell>
        )
    }

    if (confirm.isPending) {
        return (
            <PayShell>
                <Spinner className="mx-auto size-12 text-primary" />
                <h2 className="mt-4 text-lg font-semibold text-foreground">
                    {t("pay.paying.title")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("pay.paying.body")}</p>
            </PayShell>
        )
    }

    if (confirm.isSuccess) {
        return (
            <PayShell>
                <h2 className="text-lg font-semibold text-foreground">{t("pay.success.title")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("pay.success.body")}</p>
                <Button
                    variant="cta"
                    className="mt-6 h-11 w-full"
                    onClick={() => void navigate({ to: "/account/orders" })}
                >
                    {t("pay.action.backToOrders")}
                </Button>
            </PayShell>
        )
    }

    return (
        <PayShell>
            <h2 className="text-lg font-semibold text-foreground">
                {confirm.isError ? t("pay.failure.notEffective.title") : t("pay.return.title")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
                {confirm.isError ? t("pay.failure.notEffective.body") : t("pay.return.body")}
            </p>
            <div className="mt-6 flex flex-col gap-3">
                <Button
                    variant="cta"
                    className="h-11 w-full"
                    onClick={() => confirm.mutate(out_trade_no)}
                >
                    {t("pay.return.confirm")}
                </Button>
                <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={() => void navigate({ to: "/account/orders" })}
                >
                    {t("pay.action.backToOrders")}
                </Button>
            </div>
        </PayShell>
    )
}
