import { useCreatePayment, useConfirmPayment } from "#/checkout"
import { orderDetailOptions } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Wallet, CheckCircle2 } from "lucide-react"

import { toApiError, type Money } from "@shop/common"
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
    head: () => ({ meta: [{ title: "收银台 - Shop" }] }),
})

/** 挂起占位：与收银台同形的居中卡片 */
function PaySkeleton() {
    return (
        <div className="flex min-h-page-center flex-col items-center justify-center px-6">
            <Card className="w-full max-w-md text-center">
                <CardContent>
                    <Spinner className="mx-auto size-12 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold text-foreground">正在加载订单…</h2>
                    <p className="mt-2 text-sm text-muted-foreground">请稍候。</p>
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
// fallow-ignore-next-line complexity -- 收银台状态机 5 个 phase 各自选一个同形内块，分支就是状态机本身；再拆会把同一状态机粉碎到多个组件
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
// fallow-ignore-next-line complexity -- phase → 内块的一一映射，每个分支只选一个组件
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
                title="发起支付失败"
                hint="请重试或前往订单列表稍后支付。"
                buttons={[
                    { text: "重试发起", onClick: onPay, variant: "cta" },
                    { text: "返回我的订单", onClick: onGoOrders, variant: "outline" },
                ]}
            />
        )
    }
    if (phase === "confirm-error") {
        return (
            <PayFailed
                title="支付未生效"
                hint="订单状态可能已变更（已被支付/取消/关闭），请前往订单列表查看。"
                buttons={[
                    { text: "返回我的订单", onClick: onGoOrders, variant: "cta" },
                    { text: "查看订单详情", onClick: onGoDetail, variant: "outline" },
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
    return (
        <>
            <Spinner className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">正在支付…</h2>
            <p className="mt-2 text-sm text-muted-foreground">请稍候。</p>
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
    return (
        <>
            <Wallet className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">收银台</h2>
            <p className="mt-2 text-sm text-muted-foreground">订单号 {orderNo}</p>
            <Price
                value={payAmount}
                className="mt-4 text-4xl font-bold text-foreground"
            />
            <p className="mt-2 text-xs text-muted-foreground">
                模拟支付通道（MOCK），点击下方按钮确认支付
            </p>

            <div className="mt-6 flex flex-col gap-3">
                <Button
                    variant="cta"
                    className="h-11 w-full"
                    onClick={onPay}
                >
                    确认支付
                </Button>
                <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={onGoOrders}
                >
                    返回我的订单
                </Button>
            </div>
        </>
    )
}

/** phase=success：已支付，等商家发货 */
function PayDone({ onGoDetail, onGoOrders }: { onGoDetail: () => void; onGoOrders: () => void }) {
    return (
        <>
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">支付成功</h2>
            <p className="mt-2 text-sm text-muted-foreground">订单已支付，等待商家发货。</p>
            <div className="mt-6 flex flex-col gap-3">
                <Button
                    variant="cta"
                    className="h-11 w-full"
                    onClick={onGoDetail}
                >
                    查看订单详情
                </Button>
                <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={onGoOrders}
                >
                    返回我的订单
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
