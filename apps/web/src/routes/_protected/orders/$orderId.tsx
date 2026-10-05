import { message } from "#/locales/message"
import {
    OrderProgress,
    OrderShopSection,
    OrderStatusSection,
    OrderSummaryCard,
    afterSaleOptions,
    orderDetailOptions,
} from "#/order"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
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
    type OrderAction,
    type OrderDetail,
    type OrderItem,
} from "#/order"
import type { TicketResponse } from "@shop/api/sdk"
import { ReviewDialog } from "#/reviews"
import { notify } from "@shop/app-kit/data"
import { toApiError } from "@shop/common/contract"
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
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.orderDetail", match.context.locale) }],
    }),
})

/** 挂起占位：与真实结构同形（页头 + 两张卡），避免加载完成时跳版 */
function OrderDetailSkeleton() {
    const t = useT()
    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title={t("web.order.card.detail")}
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
    const t = useT()
    const order = useSuspenseQuery(orderDetailOptions(orderId)).data
    // 售后单与订单详情并行拉取：售后卡是订单的一部分，没必要等订单回来再串行请求
    // （附属件，故非 suspense：失败就不画卡，与「从未申请过」同一呈现）
    const afterSale = useQuery(afterSaleOptions(orderId))
    const cancelAfterSale = useCancelAfterSale(orderId)

    // 状态区客户操作分发（取消走取消原因弹窗，由本页渲染 cancelDialog）；商品区的加购/售后走 handleItemAction
    const { handleAction, pendingAction, cancelDialog } = useOrderActions()
    const ticket = afterSale.data ?? undefined
    const dialogs = useDialogs()
    const afterSaleActions = useAfterSaleActions({ orderId, cancelAfterSale, dialogs })

    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title={t("web.order.card.detail")}
                containerClassName="max-w-narrow"
            />

            <div className="narrow-page">
                <div className="flex gap-8">
                    <OrderMainColumn
                        order={order}
                        ticket={ticket}
                        dialogs={dialogs}
                        pendingAction={pendingAction}
                        cancelPending={cancelAfterSale.isPending}
                        onStatusAction={(action) => handleAction(order, action)}
                        onAfterSaleAction={afterSaleActions.handle}
                    />

                    {/* 右侧信息卡 */}
                    <aside className="w-80 shrink-0">
                        <OrderSummaryCard order={order} />
                    </aside>
                </div>
            </div>

            {/* 取消订单弹窗（原因 + 备注）：状态由 useOrderActions 持有 */}
            {cancelDialog}

            <OrderDialogs
                orderId={orderId}
                orderNo={order.orderNo}
                items={order.items}
                reviewable={order.status === "completed"}
                ticket={ticket}
                dialogs={dialogs}
            />
        </div>
    )
}

/** 左主区：状态卡 → 售后卡 → 评价入口 → 店铺与商品（顺序即阅读顺序） */
function OrderMainColumn({
    order,
    ticket,
    dialogs,
    pendingAction,
    cancelPending,
    onStatusAction,
    onAfterSaleAction,
}: {
    order: OrderDetail
    ticket: TicketResponse | undefined
    dialogs: ReturnType<typeof useDialogs>
    pendingAction: OrderAction | undefined
    cancelPending: boolean
    onStatusAction: (action: OrderAction) => void
    onAfterSaleAction: (action: AfterSaleAction) => void
}) {
    return (
        <div className="min-w-0 flex-1 space-y-8">
            {/* 进度条 + 状态 + 地址 + 操作 */}
            <Card>
                <CardContent className="space-y-6">
                    <OrderProgress status={order.status} />
                    <OrderStatusSection
                        order={order}
                        pendingAction={pendingAction}
                        onAction={onStatusAction}
                    />
                </CardContent>
            </Card>

            {/* 售后（有单才画；从未申请过售后时这一块不存在） */}
            {ticket && (
                <AfterSaleCard
                    ticket={ticket}
                    pendingAction={cancelPending ? "cancel" : undefined}
                    onAction={onAfterSaleAction}
                />
            )}

            {/* 评价入口：只有「已完成」的订单才谈得上评价（REV-03）。
                不占商品区的按钮排——那是订单状态机的动作，评价是评价域的独立入口 */}
            {order.status === "completed" && <ReviewPrompt onOpen={() => dialogs.open("review")} />}

            {/* 店铺 + 商品 */}
            <OrderShopSection
                order={order}
                items={order.items}
                canApplyAfterSale={canApplyAfterSale(order)}
                onItemAction={(action) => handleItemAction(action, dialogs)}
            />
        </div>
    )
}

/** 弹窗名：售后申请 / 售后回寄 / 评价（三张互斥，同时最多开一张） */
type DialogName = "apply" | "return" | "review"

/** 弹窗开关状态：空对象 = 全关（关掉任意一张就是回到空，不留残值） */
type DialogState = { open?: DialogName }

/** 弹窗开关：页面唯一的弹窗状态源（申请/回寄/评价都从这里开） */
function useDialogs() {
    const [state, setState] = useState<DialogState>({})
    return {
        /** 当前开着的弹窗（undefined = 全关） */
        current: state.open,
        open: (name: DialogName) => setState({ open: name }),
        close: (open: boolean) => setState(open && state.open ? { open: state.open } : {}),
    }
}

/** 商品行操作：「申请售后」开弹窗，其余（加入购物车等）仍是占位 */
function handleItemAction(action: string, dialogs: ReturnType<typeof useDialogs>) {
    if (action === "after_sale") return dialogs.open("apply")
    notify.info(message("web.order.soon.action", { action }))
}

/** 评价入口卡：逐件打分与留言（弹窗由 OrderDialogs 持有） */
function ReviewPrompt({ onOpen }: { onOpen: () => void }) {
    const t = useT()
    return (
        <Card>
            <CardContent className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium">{t("web.order.review.title")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("web.order.review.description")}
                    </p>
                </div>
                <Button onClick={onOpen}>{t("web.order.review.action")}</Button>
            </CardContent>
        </Card>
    )
}

/** 售后卡操作分发：撤销走全局二次确认，回寄/重新申请开弹窗，查看退货物流跳物流详情页（退货包裹与正向共用一套轨迹） */
function useAfterSaleActions({
    orderId,
    cancelAfterSale,
    dialogs,
}: {
    orderId: string
    cancelAfterSale: ReturnType<typeof useCancelAfterSale>
    dialogs: ReturnType<typeof useDialogs>
}) {
    const navigate = useNavigate()
    const t = useT()

    const handle = (action: AfterSaleAction) => {
        if (action === "cancel") {
            void confirm({
                // 撤销后这张单就终态了，窗口内还能重新申请，所以文案说清「可以再来」
                title: t("web.order.afterSale.cancelConfirm.title"),
                description: t("web.order.afterSale.cancelConfirm.description"),
                confirmText: t("web.order.afterSale.action.cancel"),
                action: () => cancelAfterSale.mutateAsync(),
            })
            return
        }
        if (action === "return") return dialogs.open("return")
        // reapply = 后端在终态单上下发的「重新申请」（C5b），走的还是那张申请弹窗
        if (action === "reapply") return dialogs.open("apply")
        void navigate({ to: "/logistics/$orderId", params: { orderId } })
    }

    return { handle }
}

/** 售后与评价弹窗集合（取消订单弹窗由 useOrderActions 自带） */
function OrderDialogs({
    orderId,
    orderNo,
    items,
    reviewable,
    ticket,
    dialogs,
}: {
    orderId: string
    orderNo: string
    items: OrderItem[]
    reviewable: boolean
    ticket: TicketResponse | undefined
    dialogs: ReturnType<typeof useDialogs>
}) {
    return (
        <>
            {reviewable && (
                <ReviewDialog
                    open={dialogs.current === "review"}
                    onOpenChange={dialogs.close}
                    orderId={orderId}
                    orderNo={orderNo}
                    items={items}
                />
            )}

            <AfterSaleApplyDialog
                open={dialogs.current === "apply"}
                onOpenChange={dialogs.close}
                orderId={orderId}
                orderNo={orderNo}
            />

            <AfterSaleReturnDialog
                open={dialogs.current === "return"}
                onOpenChange={dialogs.close}
                orderId={orderId}
                defaultLogisticsCompany={ticket?.returnLogisticsCompany}
                defaultTrackingNo={ticket?.returnTrackingNo}
                returnAddress={ticket?.returnAddress}
            />
        </>
    )
}
