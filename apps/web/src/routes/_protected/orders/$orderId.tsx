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
    orderItemActionLabel,
    useCancelAfterSale,
    useOrderActions,
    type AfterSaleAction,
    type OrderAction,
    type OrderDetail,
    type OrderItem,
    type OrderItemAction,
} from "#/order"
import type { TicketResponse } from "@shop/api/sdk"
import { ReviewDialog } from "#/reviews"
import { notify } from "@shop/app-kit/data"
import { toApiError } from "@shop/common/contract"
import { Button, Card, CardContent, confirm, Skeleton } from "@shop/ui-web"
import { noop, useQuery, useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/orders/$orderId")({
    preloadStaleTime: 0,
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient
            .query(orderDetailOptions(params.orderId, Infinity))
            .catch((error: unknown) => {
                if (toApiError(error).status === 404) throw notFound()
                throw error
            })
        // 售后单是详情页的附属件：预取失败不挡整页（「从未申请过售后」后端给 404，已在 queryFn 归零为 null）
        void context.queryClient
            .query({ ...afterSaleOptions(params.orderId), staleTime: Infinity })
            .catch(noop)
    },
    // 挂起 → pendingComponent：Router 会给该 match 套 Suspense（见 Match.js 的 pendingElement）
    pendingComponent: OrderDetailSkeleton,
    component: OrderDetailPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.orderDetail", match.context.locale) }],
    }),
})

function OrderDetailSkeleton() {
    const t = useT()
    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title={t("order.card.detail")}
                containerClassName="max-w-narrow"
            />
            <div className="narrow-page space-y-8">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
            </div>
        </div>
    )
}

function OrderDetailPage() {
    const { orderId } = Route.useParams()
    const t = useT()
    const order = useSuspenseQuery(orderDetailOptions(orderId)).data
    const afterSale = useQuery(afterSaleOptions(orderId))
    const cancelAfterSale = useCancelAfterSale(orderId)

    const { handleAction, pendingAction, cancelDialog } = useOrderActions()
    const ticket = afterSale.data ?? undefined
    const dialogs = useDialogs()
    const afterSaleActions = useAfterSaleActions({ orderId, cancelAfterSale, dialogs })

    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title={t("order.card.detail")}
                containerClassName="max-w-narrow"
            />

            <div className="narrow-page">
                <div className="flex flex-col gap-8 lg:flex-row">
                    <OrderMainColumn
                        order={order}
                        ticket={ticket}
                        dialogs={dialogs}
                        pendingAction={pendingAction}
                        cancelPending={cancelAfterSale.isPending}
                        onStatusAction={(action) => handleAction(order, action)}
                        onAfterSaleAction={afterSaleActions.handle}
                    />

                    <aside className="w-full shrink-0 lg:w-80">
                        <OrderSummaryCard order={order} />
                    </aside>
                </div>
            </div>

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
    const t = useT()
    return (
        <div className="min-w-0 flex-1 space-y-8">
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

            {ticket && (
                <AfterSaleCard
                    ticket={ticket}
                    pendingAction={cancelPending ? "cancel" : undefined}
                    onAction={onAfterSaleAction}
                />
            )}

            {order.status === "completed" && <ReviewPrompt onOpen={() => dialogs.open("review")} />}

            <OrderShopSection
                order={order}
                items={order.items}
                canApplyAfterSale={canApplyAfterSale(order)}
                onItemAction={(action) =>
                    handleItemAction(action, dialogs, orderItemActionLabel(action, t))
                }
            />
        </div>
    )
}

type DialogName = "apply" | "return" | "review"

type DialogState = { open?: DialogName }

function useDialogs() {
    const [state, setState] = useState<DialogState>({})
    return {
        current: state.open,
        open: (name: DialogName) => setState({ open: name }),
        close: (open: boolean) => setState(open && state.open ? { open: state.open } : {}),
    }
}

function handleItemAction(
    action: OrderItemAction,
    dialogs: ReturnType<typeof useDialogs>,
    label: string,
) {
    if (action === "after_sale") return dialogs.open("apply")
    notify.info(message("order.soon.action", { action: label }))
}

function ReviewPrompt({ onOpen }: { onOpen: () => void }) {
    const t = useT()
    return (
        <Card>
            <CardContent className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium">{t("order.review.title")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("order.review.description")}
                    </p>
                </div>
                <Button onClick={onOpen}>{t("order.review.action")}</Button>
            </CardContent>
        </Card>
    )
}

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
                title: t("order.afterSale.cancelConfirm.title"),
                description: t("order.afterSale.cancelConfirm.description"),
                confirmText: t("order.afterSale.action.cancel"),
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
