import { OrderProgress, OrderShopSection, OrderStatusSection, OrderSummaryCard } from "#/order"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { useState } from "react"

import { AccountHeader } from "#/account"
import { useOrderDetail, useOrderActions } from "#/order"
import { notify } from "@shop/app-kit"
import { Card, CardContent, ConfirmDialog, Skeleton } from "@shop/ui-web"

function notifyItemAction(_order: unknown, action: string) {
    notify.info(`「${action}」即将上线`)
}

export const Route = createFileRoute("/_protected/orders/$orderId")({
    component: OrderDetailPage,
    head: () => ({
        meta: [{ title: "订单详情 - Shop" }],
    }),
})

/** 订单详情页：独立页面（不走 account 侧边栏布局），左进度/状态/商品，右侧信息卡。
 * 受保护路由，挂载时必已登录，数据客户端拉取（不进 loader）。 */
function OrderDetailPage() {
    const { orderId } = Route.useParams()
    const { data: order, isLoading, isError } = useOrderDetail(orderId)

    // 状态区客户操作分发（商品区是加购/售后，走 notifyItemAction）；取消弹窗由本页持有
    const [cancelOpen, setCancelOpen] = useState(false)
    const { handleAction, pendingAction, cancel } = useOrderActions(() => setCancelOpen(true))

    if (isError) throw notFound()
    if (isLoading || !order) {
        return (
            <div className="flex flex-1 flex-col">
                <AccountHeader
                    title="订单详情"
                    widthClass="max-w-(--container-narrow)"
                />
                <div className="mx-auto w-full max-w-narrow flex-1 space-y-8 px-6 py-8">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-1 flex-col">
            <AccountHeader
                title="订单详情"
                widthClass="max-w-(--container-narrow)"
            />

            <div className="mx-auto w-full max-w-narrow flex-1 px-6 py-8">
                <div className="flex gap-8">
                    {/* 左侧主区 */}
                    <div className="min-w-0 flex-1 space-y-8">
                        {/* 进度条 + 状态 + 地址 + 操作 */}
                        <Card>
                            <CardContent className="space-y-6">
                                <OrderProgress status={order.status} />
                                <OrderStatusSection
                                    order={order}
                                    pendingAction={pendingAction}
                                    onAction={handleAction}
                                />
                            </CardContent>
                        </Card>

                        {/* 店铺 + 商品 */}
                        <OrderShopSection
                            order={order}
                            items={order.items}
                            onItemAction={notifyItemAction}
                        />
                    </div>

                    {/* 右侧信息卡 */}
                    <aside className="w-80 shrink-0">
                        <OrderSummaryCard order={order} />
                    </aside>
                </div>
            </div>

            {/* 取消订单二次确认 */}
            <ConfirmDialog
                open={cancelOpen}
                onOpenChange={setCancelOpen}
                title="取消订单"
                description={<>确定取消订单 {order.orderNo} 吗？该操作不可恢复。</>}
                confirmText="取消订单"
                pending={cancel.isPending}
                onConfirm={() => cancel.mutate(order.id, { onSuccess: () => setCancelOpen(false) })}
            />
        </div>
    )
}
