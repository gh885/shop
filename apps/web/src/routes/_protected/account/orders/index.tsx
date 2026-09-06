import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@shop/ui-web"

import type { Order, OrderStatus } from "#/order"
import {
    ORDER_STATUS_LABEL,
    OrderCard,
    useMyOrders,
    useCancelOrder,
    useReceiveOrder,
} from "#/order"
import { notify } from "#/shared/lib/toast"
import { Skeleton, Spinner } from "@shop/ui-web"

export const Route = createFileRoute("/_protected/account/orders/")({
    component: OrdersPage,
    head: () => ({
        meta: [{ title: "我的订单 - 个人中心 - Shop" }],
    }),
})

/** 状态 Tab：全部 + 各状态（与后端枚举对齐，无待评价/退款中阶段） */
const STATUS_TABS: { key: OrderStatus | "all"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "pending_payment", label: "待付款" },
    { key: "pending_shipment", label: "待发货" },
    { key: "pending_receipt", label: "待收货" },
    { key: "completed", label: "交易成功" },
]

function OrdersPage() {
    const [tab, setTab] = useState<OrderStatus | "all">("all")
    const [cancelTarget, setCancelTarget] = useState<Order | undefined>()
    const navigate = useNavigate()
    const { data, isLoading, isError, refetch } = useMyOrders(tab)
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()

    // 按后端返回直接渲染（后端已按 status 过滤）；追加按状态 Tab 过滤仅用于「全部」时无需再筛
    const orders: Order[] = data?.records ?? []

    // 订单卡片操作分发：pay → 收银台；cancel → 二次确认后取消；confirm → 确认收货；其余 toast 占位
    const handleAction = (order: Order, action: string) => {
        switch (action) {
            case "pay":
                void navigate({ to: "/pay/$orderId", params: { orderId: order.id } })
                break
            case "cancel":
                setCancelTarget(order)
                break
            case "confirm":
                receive.mutate(order.id)
                break
            default:
                notify.info(`「${action}」即将上线`)
                break
        }
    }

    return (
        <div className="space-y-4">
            <h1 className="text-xl font-bold">我的订单</h1>

            {/* 状态 Tab 导航 */}
            <div className="flex gap-1 border-b border-border/60">
                {STATUS_TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`-mb-px border-b-2 px-4 pb-2.5 text-sm transition-colors ${
                            tab === t.key
                                ? "border-primary font-medium text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {/* 占位骨架：数据未到，无稳定 key 可用，index 合法 */}
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton
                            /* eslint-disable-next-line react/no-array-index-key */
                            key={i}
                            className="h-40 w-full rounded-2xl"
                        />
                    ))}
                </div>
            ) : isError ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <CircleAlert />
                        </EmptyMedia>
                        <EmptyTitle>加载失败</EmptyTitle>
                        <EmptyDescription>请稍后重试或刷新页面。</EmptyDescription>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void refetch()}
                        >
                            重新加载
                        </Button>
                    </EmptyHeader>
                </Empty>
            ) : orders.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <CircleAlert />
                        </EmptyMedia>
                        <EmptyTitle>
                            {tab === "all" ? "暂无订单" : `暂无${ORDER_STATUS_LABEL[tab]}订单`}
                        </EmptyTitle>
                        <EmptyDescription>去逛逛，把心仪好物带回家。</EmptyDescription>
                        <Button
                            className="mt-2"
                            onClick={() => void navigate({ to: "/" })}
                        >
                            去逛逛
                        </Button>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            pendingAction={
                                cancel.isPending
                                    ? "cancel"
                                    : receive.isPending
                                      ? "confirm"
                                      : undefined
                            }
                            onDetail={(o) =>
                                void navigate({
                                    to: "/orders/$orderId",
                                    params: { orderId: o.id },
                                })
                            }
                            onAction={handleAction}
                        />
                    ))}
                </div>
            )}

            {/* 取消订单二次确认 */}
            <AlertDialog
                open={Boolean(cancelTarget)}
                onOpenChange={(open) => !open && setCancelTarget(undefined)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>取消订单</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定取消订单 {cancelTarget?.orderNo ?? ""} 吗？该操作不可恢复。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={cancel.isPending}
                            onClick={() => {
                                if (cancelTarget)
                                    cancel.mutate(cancelTarget.id, {
                                        onSuccess: () => setCancelTarget(undefined),
                                    })
                            }}
                        >
                            {cancel.isPending && <Spinner />}取消订单
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
