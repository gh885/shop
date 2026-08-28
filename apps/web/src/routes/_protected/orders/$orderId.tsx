import { createFileRoute, notFound } from "@tanstack/react-router"

import { AccountHeader } from "#/widgets/account"
import { useOrderDetail } from "#/order"
import { OrderProgress, OrderShopSection, OrderStatusSection, OrderSummaryCard } from "#/order"
import { notify } from "#/shared/lib/toast"
import { Skeleton } from "@shop/ui-web"

function notifyOrderAction(_order: unknown, action: string) {
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

    if (isError) throw notFound()
    if (isLoading || !order) {
        return (
            <div className="flex flex-1 flex-col">
                <AccountHeader
                    title="订单详情"
                    widthClass="max-w-(--container-narrow)"
                />
                <div className="mx-auto w-full max-w-(--container-narrow) flex-1 space-y-8 px-6 py-8">
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

            <div className="mx-auto w-full max-w-(--container-narrow) flex-1 px-6 py-8">
                <div className="flex gap-8">
                    {/* 左侧主区 */}
                    <div className="min-w-0 flex-1 space-y-8">
                        {/* 进度条 + 状态 + 地址 + 操作 */}
                        <div className="space-y-6 rounded-xl bg-background p-6">
                            <OrderProgress status={order.status} />
                            <OrderStatusSection
                                order={order}
                                onAction={notifyOrderAction}
                            />
                        </div>

                        {/* 店铺 + 商品 */}
                        <OrderShopSection
                            order={order}
                            items={order.items}
                            onItemAction={notifyOrderAction}
                        />
                    </div>

                    {/* 右侧信息卡 */}
                    <aside className="w-80 shrink-0">
                        <OrderSummaryCard order={order} />
                    </aside>
                </div>
            </div>
        </div>
    )
}
