import { useCreatePayment, useConfirmPayment } from "#/checkout"
import { orderDetailOptions } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Wallet, CheckCircle2 } from "lucide-react"

import { toApiError } from "@shop/common"
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
 */
// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 收银台状态机 7 分支已用 PayPhase 显式建模（注释与分支一一对应），拆分会把同一状态机渲染碎片化到多个组件；分支内无嵌套业务逻辑
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

    const paying = create.isPending || confirm.isPending
    // 已确认成功 / 确认失败 / 发起失败 / 支付中 / 待点按（收银台状态机，渲染分支与之一一对应）
    const phase: PayPhase = confirm.isSuccess
        ? "success"
        : confirm.isError
          ? "confirm-error"
          : create.isError
            ? "create-error"
            : paying
              ? "paying"
              : "ready"

    // 金额恒由后端按订单投影给出（Money 的 amount 非空）
    const amount = order.payAmount.amount

    return (
        <div className="flex min-h-page-center flex-col items-center justify-center px-6">
            <Card className="w-full max-w-md text-center">
                <CardContent>
                    {phase === "paying" && (
                        <>
                            <Spinner className="mx-auto size-12 text-primary" />
                            <h2 className="mt-4 text-lg font-semibold text-foreground">
                                正在支付…
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">请稍候。</p>
                        </>
                    )}

                    {phase === "ready" && (
                        <>
                            <Wallet className="mx-auto size-12 text-primary" />
                            <h2 className="mt-4 text-lg font-semibold text-foreground">收银台</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                订单号 {order.orderNo}
                            </p>
                            <Price
                                value={amount}
                                className="mt-4 text-4xl font-bold text-foreground"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                                模拟支付通道（MOCK），点击下方按钮确认支付
                            </p>

                            <div className="mt-6 flex flex-col gap-3">
                                <Button
                                    variant="cta"
                                    className="h-11 w-full"
                                    onClick={startPay}
                                >
                                    确认支付
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 w-full"
                                    onClick={goOrders}
                                >
                                    取消，返回订单
                                </Button>
                            </div>
                        </>
                    )}

                    {phase === "success" && (
                        <>
                            <CheckCircle2 className="mx-auto size-12 text-success" />
                            <h2 className="mt-4 text-lg font-semibold text-foreground">支付成功</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                订单已支付，等待商家发货。
                            </p>
                            <div className="mt-6 flex flex-col gap-3">
                                <Button
                                    variant="cta"
                                    className="h-11 w-full"
                                    onClick={goDetail}
                                >
                                    查看订单详情
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 w-full"
                                    onClick={goOrders}
                                >
                                    返回我的订单
                                </Button>
                            </div>
                        </>
                    )}

                    {phase === "create-error" && (
                        <>
                            <h2 className="text-lg font-semibold text-destructive">发起支付失败</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                请重试或前往订单列表稍后支付。
                            </p>
                            <div className="mt-6 flex flex-col gap-3">
                                <Button
                                    variant="cta"
                                    className="h-11 w-full"
                                    onClick={startPay}
                                >
                                    重试发起
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 w-full"
                                    onClick={goOrders}
                                >
                                    返回我的订单
                                </Button>
                            </div>
                        </>
                    )}

                    {phase === "confirm-error" && (
                        <>
                            <h2 className="text-lg font-semibold text-destructive">支付未生效</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                订单状态可能已变更（已被支付/取消/关闭），请前往订单列表查看。
                            </p>
                            <div className="mt-6 flex flex-col gap-3">
                                <Button
                                    variant="cta"
                                    className="h-11 w-full"
                                    onClick={goOrders}
                                >
                                    返回我的订单
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-11 w-full"
                                    onClick={goDetail}
                                >
                                    查看订单详情
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
