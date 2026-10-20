import { createFileRoute } from "@tanstack/react-router"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    DataTableSkeleton,
} from "@shop/ui-web"
import { PackageOpen } from "lucide-react"
import { useT } from "#/locales/use-t"
import { OrderTable, type OrderIdentity } from "#/domains/order/list/table"
import { OrderFilterBar } from "#/domains/order/list/filter"
import { ShipDialog } from "#/domains/order/list/ship-dialog"
import { AfterSaleDecisionDialog } from "#/domains/order/after-sale-decision-dialog"
import type { SaleDecisionKind } from "#/domains/order/after-sale-decision"
import { useOrderList } from "#/domains/order/list/use-order-list"
import { orderListSearchSchema } from "#/domains/order/search"
import { useShop } from "#/domains/shop"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/trade/order")({
    validateSearch: orderListSearchSchema,
    component: OrdersPage,
})

// 只存订单 id：售后决策不可逆、涉及资金，弹窗按 id 重拉当前状态，别缓存列表里的旧行
type SaleConfirm = { orderId: string; orderNo: string; kind: SaleDecisionKind }

function OrdersPage() {
    const t = useT()
    const search = Route.useSearch()
    const shop = useShop()
    const {
        orders,
        records,
        total,
        busyId,
        handleFilterChange,
        onPageChange,
        ship,
        resolveShipDraft,
        afterSaleActionsOf,
        agreeAfterSale,
        rejectAfterSale,
        receiveReturn,
        interceptReturn,
        retryRefund,
        revealPhone,
        revealPhoneFor,
    } = useOrderList(shop.id, search)
    const [shipTarget, setShipTarget] = useState<OrderIdentity | undefined>()
    const [confirm, setConfirm] = useState<SaleConfirm | undefined>()

    // 必须 return 动作的 promise：弹窗按结果决定失败不关窗、把 422 落到理由框
    const runConfirm = (reason: string) => {
        if (!confirm) return
        if (confirm.kind === "agree") return agreeAfterSale(confirm.orderId)
        if (confirm.kind === "reject") return rejectAfterSale(confirm.orderId, reason)
        if (confirm.kind === "intercept") return interceptReturn(confirm.orderId)
        if (confirm.kind === "retry") return retryRefund(confirm.orderId)
        return receiveReturn(confirm.orderId)
    }

    return (
        <div className="space-y-5">
            <OrderFilterBar
                value={search.status}
                onChange={handleFilterChange}
            />

            {orders.isPending ? (
                <DataTableSkeleton columns={7} />
            ) : records.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <PackageOpen />
                        </EmptyMedia>
                        <EmptyTitle>{t("order.empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("order.empty.description")}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <OrderTable
                    rows={records}
                    page={search.page}
                    pageSize={search.size}
                    total={total}
                    busyId={busyId}
                    onPageChange={onPageChange}
                    onShip={setShipTarget}
                    afterSaleActionsOf={afterSaleActionsOf}
                    onAfterSaleAction={(o, action) =>
                        setConfirm({ orderId: o.id, orderNo: o.orderNo, kind: action })
                    }
                    onRevealPhone={(o) => revealPhone(o.id)}
                    revealingId={revealPhoneFor}
                />
            )}

            <ShipDialog
                open={Boolean(shipTarget)}
                order={shipTarget}
                onOpenChange={(open) => !open && setShipTarget(undefined)}
                onShip={ship}
                onResolveDraft={resolveShipDraft}
            />

            <AfterSaleDecisionDialog
                open={Boolean(confirm)}
                onOpenChange={(open) => !open && setConfirm(undefined)}
                kind={confirm?.kind ?? "agree"}
                orderId={confirm?.orderId}
                orderNo={confirm?.orderNo}
                shopId={shop.id}
                onConfirm={runConfirm}
            />
        </div>
    )
}
