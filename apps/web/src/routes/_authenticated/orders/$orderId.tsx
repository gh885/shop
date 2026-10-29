import {
    OrderProgress,
    OrderShopSection,
    OrderStatusSection,
    OrderSummaryCard,
    afterSaleOptions,
    orderDetailOptions,
} from "#/domains/order"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { useState } from "react"

import { SearchHeader } from "#/shared/ui/SearchHeader"
import {
    AfterSaleApplyDialog,
    AfterSaleCard,
    AfterSaleReturnDialog,
    allItems,
    canApplyAfterSale,
    orderItemActionLabel,
    useCancelAfterSale,
    useOrderActions,
    type AfterSaleAction,
    type OrderAction,
    type OrderDetail,
} from "#/domains/order"
import type { CaseView } from "@shop/api/sdk"
import { notify } from "@shop/app-kit/data"
import { message } from "#/locales/message"
import { toApiError } from "@shop/common/contract"
import { Card, CardContent, confirm, Skeleton } from "@shop/ui-web"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
    preloadStaleTime: 0,
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient
            .query(orderDetailOptions(params.orderId, Infinity))
            .catch((error: unknown) => {
                if (toApiError(error).status === 404) throw notFound()
                throw error
            })
    },
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
    // 售后单挂在子订单上：取第一张子单的
    const firstSellerOrder = order.orders[0]
    const afterSale = useQuery(afterSaleOptions(firstSellerOrder?.id ?? orderId))
    const cancelAfterSale = useCancelAfterSale()

    const { handleAction, pendingAction, cancelDialog } = useOrderActions()
    const refund: CaseView | null = afterSale.data ?? null
    const dialogs = useDialogs()
    const afterSaleActions = useAfterSaleActions({ refund, cancelAfterSale, dialogs })

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
                        refund={refund}
                        dialogs={dialogs}
                        pendingAction={pendingAction}
                        cancelPending={cancelAfterSale.isPending}
                        onStatusAction={(action) =>
                            handleAction(
                                {
                                    orderGroupId: order.id,
                                    orderNo: order.orderNo,
                                },
                                action,
                            )
                        }
                        onAfterSaleAction={afterSaleActions.handle}
                    />

                    <aside className="w-full shrink-0 lg:w-80">
                        <OrderSummaryCard order={order} />
                    </aside>
                </div>
            </div>

            {cancelDialog}

            <AfterSaleApplyDialog
                open={dialogs.current === "apply"}
                onOpenChange={dialogs.close}
                sellerOrderId={firstSellerOrder?.id ?? ""}
                orderNo={order.orderNo}
                items={allItems(order)}
            />

            <AfterSaleReturnDialog
                open={dialogs.current === "return"}
                onOpenChange={dialogs.close}
                caseId={refund?.id ?? ""}
            />
        </div>
    )
}

function OrderMainColumn({
    order,
    refund,
    dialogs,
    pendingAction,
    cancelPending,
    onStatusAction,
    onAfterSaleAction,
}: {
    order: OrderDetail
    refund: CaseView | null
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

            {refund && (
                <AfterSaleCard
                    refund={refund}
                    pendingAction={cancelPending ? "cancel" : undefined}
                    onAction={onAfterSaleAction}
                />
            )}

            {order.orders.map((sellerOrder) => (
                <OrderShopSection
                    key={sellerOrder.id}
                    order={sellerOrder}
                    items={sellerOrder.items}
                    sellerOrderId={sellerOrder.id}
                    shipping={
                        sellerOrder.fulfillmentStatus === "shipped" ||
                        sellerOrder.fulfillmentStatus === "partial_shipped"
                    }
                    canApplyAfterSale={canApplyAfterSale({ status: order.status })}
                    onItemAction={(action) =>
                        handleItemAction(action, dialogs, orderItemActionLabel(action, t))
                    }
                />
            ))}
        </div>
    )
}

type DialogName = "apply" | "return"

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
    action: "add_cart" | "after_sale",
    dialogs: ReturnType<typeof useDialogs>,
    label: string,
) {
    if (action === "after_sale") return dialogs.open("apply")
    notify.info(message("order.soon.action", { action: label }))
}

function useAfterSaleActions({
    refund,
    cancelAfterSale,
    dialogs,
}: {
    refund: CaseView | null
    cancelAfterSale: ReturnType<typeof useCancelAfterSale>
    dialogs: ReturnType<typeof useDialogs>
}) {
    const t = useT()

    const handle = (action: AfterSaleAction) => {
        if (action === "cancel" && refund) {
            void confirm({
                title: t("order.afterSale.cancelConfirm.title"),
                description: t("order.afterSale.cancelConfirm.description"),
                confirmText: t("order.afterSale.action.cancel"),
                action: () => cancelAfterSale.mutateAsync(refund.id),
            })
            return
        }
        if (action === "return") return dialogs.open("return")
        if (action === "reapply") return dialogs.open("apply")
    }

    return { handle }
}
