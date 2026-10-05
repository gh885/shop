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
    /**
     * 订单详情在 loader 读完再渲染（收银台不能拿一份可能过期的金额去收钱）：
     * 404 走 `notFound()`，其它错误 → 路由错误页 + 官方重置重试；SSR 阶段直接跳过。
     */
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient
            .query({ ...orderDetailOptions(params.orderId), staleTime: "static" })
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

/** 挂起占位：与收银台同形的居中卡片 */
function PaySkeleton() {
    const t = useT()
    return (
        <div className="flex min-h-page-center flex-col items-center justify-center px-6">
            <Card className="w-full max-w-md text-center">
                <CardContent>
                    <Spinner className="mx-auto size-12 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold text-foreground">
                        {t("web.pay.loading.title")}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t("web.pay.loading.body")}
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}

/**
 * 收银台阶段：ready → paying → success / confirm-error / create-error
 * （**订单详情本身的挂起与失败不再进状态机**：挂起由 `pendingComponent`、失败由路由错误页接管）
 */
type PayPhase = "ready" | "paying" | "success" | "confirm-error" | "create-error"

/**
 * 收银台：V1 两段式（发起→确认），由用户一次点按串联 —— 「确认支付」先创建 PENDING 流水、
 * 成功后立即模拟网关回调确认，成功后跳订单列表。不再随组件挂载自动发起（服务端命令的
 * 触发源必须是显式用户动作，而不是 mount effect）。金额取自订单详情（后端按订单投影，前端不报价）。
 *
 * 状态机只留「哪个 phase」这一个判断，五个 phase 的呈现各归一个组件（PayPhaseView），
 * 于是新增/改动某个 phase 不必再动整页 JSX。
 */
function PayPage() {
    const navigate = useNavigate()
    const { orderId } = Route.useParams()
    // 订单详情由 loader 读完（挂起/失败不再进状态机）
    const order = useSuspenseQuery(orderDetailOptions(orderId)).data
    const create = useCreatePayment()
    const confirm = useConfirmPayment()

    /** 一次点按串起两段式：发起流水 → 确认支付（mutation 链，错误各归各的 phase） */
    const startPay = () =>
        create.mutate(orderId, { onSuccess: (payment) => confirm.mutate(payment.id) })

    const goOrders = () => void navigate({ to: "/account/orders" })
    const goDetail = () => void navigate({ to: "/orders/$orderId", params: { orderId } })

    // 已确认成功 / 确认失败 / 发起失败 / 支付中 / 待点按（收银台状态机，渲染分支与之一一对应）
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

/** 收银台卡片内容：按 phase 选一个同形内块（标题/说明/按钮组） */
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
                title={t("web.pay.failure.payFailed.title")}
                hint={t("web.pay.failure.payFailed.body")}
                buttons={[
                    { text: t("web.pay.failure.payFailed.retry"), onClick: onPay, variant: "cta" },
                    {
                        text: t("web.pay.action.backToOrders"),
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
                title={t("web.pay.failure.notEffective.title")}
                hint={t("web.pay.failure.notEffective.body")}
                buttons={[
                    { text: t("web.pay.action.backToOrders"), onClick: onGoOrders, variant: "cta" },
                    {
                        text: t("web.pay.action.viewDetail"),
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

/** phase=paying：流水已发起、等网关回调 */
function PayPending() {
    const t = useT()
    return (
        <>
            <Spinner className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
                {t("web.pay.paying.title")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("web.pay.paying.body")}</p>
        </>
    )
}

/** phase=ready：待点按的收银台（金额取自订单详情，前端不报价） */
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
            <h2 className="mt-4 text-lg font-semibold text-foreground">
                {t("web.pay.cashier.title")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
                {t("web.pay.cashier.orderNo", { orderNo })}
            </p>
            <Price
                value={payAmount}
                className="mt-4 text-4xl font-bold text-foreground"
            />
            <p className="mt-2 text-xs text-muted-foreground">{t("web.pay.cashier.mockNotice")}</p>

            <div className="mt-6 flex flex-col gap-3">
                <Button
                    variant="cta"
                    className="h-11 w-full"
                    onClick={onPay}
                >
                    {t("web.pay.cashier.confirm")}
                </Button>
                <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={onGoOrders}
                >
                    {t("web.pay.action.backToOrders")}
                </Button>
            </div>
        </>
    )
}

/** phase=success：已支付，等商家发货 */
function PayDone({ onGoDetail, onGoOrders }: { onGoDetail: () => void; onGoOrders: () => void }) {
    const t = useT()
    return (
        <>
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
                {t("web.pay.success.title")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("web.pay.success.body")}</p>
            <div className="mt-6 flex flex-col gap-3">
                <Button
                    variant="cta"
                    className="h-11 w-full"
                    onClick={onGoDetail}
                >
                    {t("web.pay.success.viewDetail")}
                </Button>
                <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={onGoOrders}
                >
                    {t("web.pay.action.backToOrders")}
                </Button>
            </div>
        </>
    )
}

/** phase=create-error / confirm-error：两段里某一段没成（按钮组由 phase 自己给，顺序/样式即业务优先级） */
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
