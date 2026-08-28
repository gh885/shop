import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"

import type { Order, OrderStatus } from "#/order"
import { ORDER_STATUS_LABEL, OrderCard, useMyOrders } from "#/order"
import { notify } from "#/shared/lib/toast"
import { Skeleton } from "@shop/ui-web"

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
    const navigate = useNavigate()
    const { data, isLoading, isError } = useMyOrders(tab)

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
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            onDetail={(o) =>
                                void navigate({
                                    to: "/orders/$orderId",
                                    params: { orderId: o.id },
                                })
                            }
                            onAction={(_order, action) => notify.info(`「${action}」即将上线`)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
