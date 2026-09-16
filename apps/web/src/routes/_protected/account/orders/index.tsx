import {
    myOrdersOptions,
    useMyOrders,
    useOrderActions,
    ORDER_STATUS_LABEL,
    ORDER_STATUS_TABS,
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
    cn,
} from "@shop/ui-web"
import { noop } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/account/orders/")({
    // 客户端预热（受保护页 SSR 服务端拿不到 token，loader 在服务端直接跳过，见 _protected/route.tsx）：
    // 只预取默认「全部」页签第一页；切页签/翻页是新 queryKey，由组件侧按需拉取。
    // query() 失败会 reject —— 预热而已，吞掉；错误仍由组件侧的就地错误态处理。
    loader: ({ context }) => {
        if (import.meta.env.SSR) return
        void context.queryClient.query(myOrdersOptions({ status: "all" })).catch(noop)
    },
    component: OrdersPage,
    head: () => ({
        meta: [{ title: "我的订单 - 个人中心 - Shop" }],
    }),
})

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
                {ORDER_STATUS_TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={cn(
                            "-mb-px border-b-2 px-4 pb-2.5 text-sm transition-colors",
                            tab === t.key
                                ? "border-foreground font-medium text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
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
                            /* eslint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key */
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
                            onDetail={() =>
                                void navigate({
                                    to: "/orders/$orderId",
                                    params: { orderId: order.id },
                                })
                            }
                            onAction={(action) => handleAction(order, action)}
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
