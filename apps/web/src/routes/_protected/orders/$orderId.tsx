import { OrderProgress, OrderShopSection, OrderStatusSection, OrderSummaryCard } from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { AccountHeader } from "#/account"
import {
    AfterSaleApplyDialog,
    AfterSaleCard,
    AfterSaleReturnDialog,
    canApplyAfterSale,
    useAfterSale,
    useCancelAfterSale,
    useOrderActions,
    useOrderDetail,
    type AfterSaleAction,
} from "#/order"
import { notify } from "@shop/app-kit"
import { Card, CardContent, ConfirmDialog, Skeleton } from "@shop/ui-web"

export const Route = createFileRoute("/_protected/orders/$orderId")({
    component: OrderDetailPage,
    head: () => ({
        meta: [{ title: "订单详情 - Shop" }],
    }),
})

/** 订单详情页：独立页面（不走 account 侧边栏布局），左进度/状态/售后/商品，右侧信息卡。
 * 受保护路由，挂载时必已登录，数据客户端拉取（不进 loader）。 */
function OrderDetailPage() {
    const { orderId } = Route.useParams()
    const { data: order, isLoading, isError } = useOrderDetail(orderId)
    // 售后单与订单详情并行拉取：售后卡是订单的一部分，没必要等订单回来再串行请求
    const afterSale = useAfterSale(orderId)
    const cancelAfterSale = useCancelAfterSale(orderId)
    const navigate = useNavigate()

    // 状态区客户操作分发（取消确认弹窗由本页持有）；商品区的加购/售后走 handleItemAction
    const [cancelOpen, setCancelOpen] = useState(false)
    const { handleAction, pendingAction, cancel } = useOrderActions(() => setCancelOpen(true))

    // 售后三个入口的状态：申请弹窗、回寄弹窗、撤销确认
    const [applyOpen, setApplyOpen] = useState(false)
    const [returnOpen, setReturnOpen] = useState(false)
    const [cancelSaleOpen, setCancelSaleOpen] = useState(false)

    const ticket = afterSale.data ?? undefined

    /** 商品行操作：「申请售后」开弹窗，其余（加入购物车等）仍是占位 */
    const handleItemAction = (_item: unknown, action: string) => {
        if (action === "after_sale") return setApplyOpen(true)
        notify.info(`「${action}」即将上线`)
    }

    /** 售后卡操作：撤销走二次确认，回寄开弹窗，查看退货物流跳物流详情页（退货包裹与正向共用一套轨迹） */
    const handleAfterSaleAction = (action: AfterSaleAction) => {
        if (action === "cancel") return setCancelSaleOpen(true)
        if (action === "return") return setReturnOpen(true)
        void navigate({ to: "/logistics/$orderId", params: { orderId } })
    }

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

                        {/* 售后（有单才画；从未申请过售后时这一块不存在） */}
                        {ticket && (
                            <AfterSaleCard
                                ticket={ticket}
                                pendingAction={cancelAfterSale.isPending ? "cancel" : undefined}
                                onAction={handleAfterSaleAction}
                            />
                        )}

                        {/* 店铺 + 商品 */}
                        <OrderShopSection
                            order={order}
                            items={order.items}
                            canApplyAfterSale={canApplyAfterSale(order)}
                            onItemAction={handleItemAction}
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

            <AfterSaleApplyDialog
                open={applyOpen}
                onOpenChange={setApplyOpen}
                orderId={orderId}
                orderNo={order.orderNo}
            />

            <AfterSaleReturnDialog
                open={returnOpen}
                onOpenChange={setReturnOpen}
                orderId={orderId}
                defaultLogisticsCompany={ticket?.returnLogisticsCompany}
                defaultTrackingNo={ticket?.returnTrackingNo}
            />

            {/* 撤销售后二次确认：撤销后这张单就终态了，窗口内还能重新申请，所以文案说清「可以再来」 */}
            <ConfirmDialog
                open={cancelSaleOpen}
                onOpenChange={setCancelSaleOpen}
                title="撤销售后申请"
                description="撤销后本次售后结束；在申请窗口内你还可以重新提交。"
                confirmText="撤销申请"
                pending={cancelAfterSale.isPending}
                onConfirm={() =>
                    cancelAfterSale.mutate(undefined, {
                        onSuccess: () => setCancelSaleOpen(false),
                    })
                }
            />
        </div>
    )
}
