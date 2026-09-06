import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CheckCircle2, Wallet } from "lucide-react"

import { Button, Card, CardContent, Spinner } from "@shop/ui-web"
import { fenToYuan } from "@shop/api"

import { useCreatePayment, useConfirmPayment } from "#/checkout"

export const Route = createFileRoute("/_protected/pay/$orderId")({
    component: PayPage,
    head: () => ({ meta: [{ title: "收银台 - Shop" }] }),
})

/** 收银台：V1 两段式（发起→确认）。挂载即发起 PENDING 流水，用户点「确认支付」模拟网关回调，
 * 成功后跳订单列表。amount 取自流水（后端按订单投影，前端不报价）。 */
function PayPage() {
    const navigate = useNavigate()
    const { orderId } = Route.useParams()
    const create = useCreatePayment()
    const confirm = useConfirmPayment()

    // 挂载即发起（V1 两段式第一段）
    useEffect(() => {
        if (!create.isPending && !create.data) create.mutate(orderId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId])

    const goOrders = () => void navigate({ to: "/account/orders" })
    const goDetail = () => void navigate({ to: "/orders/$orderId", params: { orderId } })

    const payment = create.data
    // 已确认成功 / 发起成功但确认失败 / 发起失败 / 待发起
    const phase = confirm.isSuccess
        ? "success"
        : confirm.isError
          ? "confirm-error"
          : create.isError
            ? "create-error"
            : payment
              ? "ready"
              : "loading"

    const amount = payment?.amount ? fenToYuan(payment.amount.amount) : ""

    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-6">
            <Card className="w-full max-w-md text-center">
                <CardContent>
                    {phase === "loading" && (
                        <>
                            <Spinner className="mx-auto size-12 text-primary" />
                            <h2 className="mt-4 text-lg font-semibold text-foreground">
                                正在发起支付…
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">请稍候。</p>
                        </>
                    )}

                    {phase === "ready" && (
                        <>
                            <Wallet className="mx-auto size-12 text-primary" />
                            <h2 className="mt-4 text-lg font-semibold text-foreground">收银台</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                订单号 {payment?.orderNo}
                            </p>
                            <p className="mt-4 text-4xl font-bold tracking-tight text-foreground">
                                ¥{amount}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                模拟支付通道（MOCK），点击下方按钮确认支付
                            </p>

                            <div className="mt-6 flex flex-col gap-3">
                                <Button
                                    variant="cta"
                                    className="h-11 w-full"
                                    disabled={confirm.isPending}
                                    onClick={() => payment && confirm.mutate(payment.id)}
                                >
                                    {confirm.isPending && <Spinner />}确认支付
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
                            <CheckCircle2 className="mx-auto size-12 text-primary" />
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
                                请刷新收银台或前往订单列表重试。
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
                                    onClick={() => create.mutate(orderId)}
                                >
                                    重试发起
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
