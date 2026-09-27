import {
    OrderProgress,
    OrderShopSection,
    OrderStatusSection,
    OrderSummaryCard,
    afterSaleOptions,
    orderDetailOptions,
} from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { SearchHeader } from "#/shared/ui/SearchHeader"
import {
    AfterSaleApplyDialog,
    AfterSaleCard,
    AfterSaleReturnDialog,
    canApplyAfterSale,
    useCancelAfterSale,
    useOrderActions,
    type AfterSaleAction,
} from "#/order"
import { ReviewDialog } from "#/reviews"
import { notify } from "@shop/app-kit"
import { toApiError } from "@shop/common"
import { Button, Card, CardContent, confirm, Skeleton } from "@shop/ui-web"
import { noop, useQuery, useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/orders/$orderId")({
    /**
     * 数据在 loader 里读完再渲染（官方的 loader-as-data-source），页面组件不再有加载/错误分支：
     * - 404 → `notFound()`：走 Router 的「不存在」语义，而不是「加载失败」；
     * - 其它错误 → 抛出，由路由级 errorComponent 渲染错误页 + 官方双 reset 重试；
     * - 挂起 → `pendingComponent`（Router 会给该 match 套 Suspense，见 Match.js 的 pendingElement）；
     * - SSR 阶段服务端拿不到 token，直接跳过，由客户端补；
     *   hover intent 预取命中时 loader 直接读缓存，导航不阻塞。
     */
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient
            .query({ ...orderDetailOptions(params.orderId), staleTime: "static" })
            .catch((error: unknown) => {
                if (toApiError(error).status === 404) throw notFound()
                throw error
            })
        // 售后单是详情页的附属件：预取失败不挡整页（「从未申请过售后」后端给 404，已在 queryFn 归零为 null）
        void context.queryClient
            .query({ ...afterSaleOptions(params.orderId), staleTime: "static" })
            .catch(noop)
    },
    pendingComponent: OrderDetailSkeleton,
    component: OrderDetailPage,
    head: () => ({
        meta: [{ title: "订单详情 - Shop" }],
    }),
})

/** 挂起占位：与真实结构同形（页头 + 两张卡），避免加载完成时跳版 */
function OrderDetailSkeleton() {
    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title="订单详情"
                containerClassName="max-w-narrow"
            />
            <div className="narrow-page space-y-8">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        </div>
    )
}

/** 订单详情页：独立页面（不走 account 侧边栏布局），左进度/状态/售后/商品，右侧信息卡。
 * 受保护路由，挂载时必已登录；详情在 loader 读完（见上），组件用 suspense 读同一份缓存。 */
function OrderDetailPage() {
    const { orderId } = Route.useParams()
    const order = useSuspenseQuery(orderDetailOptions(orderId)).data
    // 售后单与订单详情并行拉取：售后卡是订单的一部分，没必要等订单回来再串行请求
    // （附属件，故非 suspense：失败就不画卡，与「从未申请过」同一呈现）
    const afterSale = useQuery(afterSaleOptions(orderId))
    const cancelAfterSale = useCancelAfterSale(orderId)
    const navigate = useNavigate()

    // 状态区客户操作分发（取消走取消原因弹窗，由本页渲染 cancelDialog）；商品区的加购/售后走 handleItemAction
    const { handleAction, pendingAction, cancelDialog } = useOrderActions()

    // 售后两个弹窗入口的状态：申请、回寄；评价弹窗同形
    const [applyOpen, setApplyOpen] = useState(false)
    const [returnOpen, setReturnOpen] = useState(false)
    const [reviewOpen, setReviewOpen] = useState(false)

    const ticket = afterSale.data ?? undefined

    /** 商品行操作：「申请售后」开弹窗，其余（加入购物车等）仍是占位 */
    const handleItemAction = (action: string) => {
        if (action === "after_sale") return setApplyOpen(true)
        notify.info(`「${action}」即将上线`)
    }

    /** 售后卡操作：撤销走全局二次确认，回寄/重新申请开弹窗，查看退货物流跳物流详情页（退货包裹与正向共用一套轨迹） */
    const handleAfterSaleAction = (action: AfterSaleAction) => {
        if (action === "cancel") {
            void confirm({
                // 撤销后这张单就终态了，窗口内还能重新申请，所以文案说清「可以再来」
                title: "撤销售后申请",
                description: "撤销后本次售后结束；在申请窗口内你还可以重新提交。",
                confirmText: "撤销申请",
                action: () => cancelAfterSale.mutateAsync(),
            })
            return
        }
        if (action === "return") return setReturnOpen(true)
        // reapply = 后端在终态单上下发的「重新申请」（C5b），走的还是那张申请弹窗
        if (action === "reapply") return setApplyOpen(true)
        void navigate({ to: "/logistics/$orderId", params: { orderId } })
    }

    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title="订单详情"
                containerClassName="max-w-narrow"
            />

            <div className="narrow-page">
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
                                    onAction={(action) => handleAction(order, action)}
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

                        {/* 评价入口：只有「已完成」的订单才谈得上评价（REV-03）。
                            不占商品区的按钮排——那是订单状态机的动作，评价是评价域的独立入口 */}
                        {order.status === "completed" && (
                            <Card>
                                <CardContent className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium">评价这单</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            逐件商品打分与留言，提交后不可修改、可追评一次
                                        </p>
                                    </div>
                                    <Button onClick={() => setReviewOpen(true)}>去评价</Button>
                                </CardContent>
                            </Card>
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

            {/* 取消订单弹窗（原因 + 备注）：状态由 useOrderActions 持有 */}
            {cancelDialog}

            {order.status === "completed" && (
                <ReviewDialog
                    open={reviewOpen}
                    onOpenChange={setReviewOpen}
                    orderId={orderId}
                    orderNo={order.orderNo}
                    items={order.items}
                />
            )}

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
                returnAddress={ticket?.returnAddress}
            />
        </div>
    )
}
