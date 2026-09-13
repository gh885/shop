import {
    useMyOrders,
    useOrderActions,
    ORDER_STATUS_LABEL,
    OrderCard,
    type OrderStatus,
    type Order,
} from "#/order"

import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { useState } from "react"
import {
    Skeleton,
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    Button,
    ConfirmDialog,
} from "@shop/ui-web"

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
    // 订单操作分发（与详情页共用）：cancel.mutate 由下方确认弹窗接线
    const { handleAction, pendingAction, cancel } = useOrderActions(setCancelTarget)

    // 按后端返回直接渲染（后端已按 status 过滤）；追加按状态 Tab 过滤仅用于「全部」时无需再筛
    const orders: Order[] = data?.records ?? []

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
                                ? "border-foreground font-medium text-foreground"
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
                            className="h-40 w-full rounded-lg"
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
                            pendingAction={pendingAction}
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
            <ConfirmDialog
                open={Boolean(cancelTarget)}
                onOpenChange={(open) => !open && setCancelTarget(undefined)}
                title="取消订单"
                description={<>确定取消订单 {cancelTarget?.orderNo ?? ""} 吗？该操作不可恢复。</>}
                confirmText="取消订单"
                pending={cancel.isPending}
                onConfirm={() => {
                    if (cancelTarget)
                        cancel.mutate(cancelTarget.id, {
                            onSuccess: () => setCancelTarget(undefined),
                        })
                }}
            />
        </div>
    )
}
