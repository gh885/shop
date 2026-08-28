import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@shop/ui-web"

import { useCreatePayment } from "#/checkout"
import { notify } from "#/shared/lib/toast"

export const Route = createFileRoute("/_protected/pay/$orderId")({
    component: PayPage,
    head: () => ({ meta: [{ title: "收银台 - Shop" }] }),
})

/** 收银台：V1 MOCK 即时成功。挂载即发起支付，成功后跳订单列表。
 * orderIds 为本次拆单全部订单 id（多单场景后续可扩展批量支付）。 */
function PayPage() {
    const navigate = useNavigate()
    const { orderId } = Route.useParams()
    const pay = useCreatePayment()

    // 挂载即发起（V1 MOCK）；不依赖交互，进页即付
    useEffect(() => {
        pay.mutate(orderId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId])

    const status = pay.isSuccess ? "success" : pay.isError ? "error" : "pending"

    const goOrders = () => void navigate({ to: "/account/orders" })
    const goDetail = () => void navigate({ to: "/orders/$orderId", params: { orderId } })

    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-6">
            <div className="w-full max-w-md rounded-2xl bg-background p-8 text-center ring-1 ring-border/60">
                {status === "pending" && (
                    <>
                        <Loader2 className="mx-auto size-12 animate-spin text-primary" />
                        <h2 className="mt-4 text-lg font-semibold text-foreground">正在支付…</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            模拟支付通道，请稍候。订单号 {pay.variables}
                        </p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <CheckCircle2 className="mx-auto size-12 text-primary" />
                        <h2 className="mt-4 text-lg font-semibold text-foreground">支付成功</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            订单已支付，等待商家发货。
                        </p>
                        <div className="mt-6 flex flex-col gap-3">
                            <Button
                                className="h-11 w-full rounded-xl bg-linear-to-r from-primary to-primary-hover text-white"
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

                {status === "error" && (
                    <>
                        <h2 className="text-lg font-semibold text-destructive">支付失败</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            请刷新收银台或前往订单列表重试。
                        </p>
                        <div className="mt-6 flex flex-col gap-3">
                            <Button
                                className="h-11 w-full rounded-xl bg-linear-to-r from-primary to-primary-hover text-white"
                                onClick={goOrders}
                            >
                                返回我的订单
                            </Button>
                            <Button
                                variant="outline"
                                className="h-11 w-full"
                                onClick={() => {
                                    notify.info("正在重新支付…")
                                    pay.mutate(orderId)
                                }}
                            >
                                重试支付
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
