import { createFileRoute } from "@tanstack/react-router"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
    StateError,
} from "@shop/ui-web"
import { PackageOpen } from "lucide-react"
import { z } from "zod"
import type { SellerOrderListItemResponse } from "@shop/api/sdk"
import { toApiError } from "@shop/common"

import { OrderTable } from "#/order/list/table"
import { OrderFilterBar } from "#/order/list/filter"
import { ShipDialog } from "#/order/list/ship-dialog"
import { AfterSaleDecisionDialog, type SaleDecisionKind } from "#/order/after-sale-decision-dialog"
import { useOrderList, type OrderListSearch } from "#/order/list/use-order-list"
import { ShopRequired } from "#/shared/ui/ShopRequired"
import { useState } from "react"

const listSearchSchema = z.object({
    status: z
        .enum(["PENDING_PAYMENT", "PAID", "SHIPPED", "COMPLETED", "CANCELLED"])
        .optional()
        .catch(undefined),
    page: z.coerce.number().int().min(1).catch(1),
    size: z.coerce.number().int().min(1).catch(10),
})

export const Route = createFileRoute("/_app/trade/order")({
    validateSearch: (search: Record<string, unknown>): OrderListSearch =>
        listSearchSchema.parse(search),
    component: OrdersPage,
})

/**
 * 售后决策目标：只留订单 id / 单号——决策弹窗会按 id 重新拉一次售后单
 * （列表可能是几分钟前拉的，不可逆的资金决定要用当前状态），页面只管把动作路由到对应 mutation。
 */
type SaleConfirm = { order: SellerOrderListItemResponse; kind: SaleDecisionKind }

function OrdersPage() {
    const search = Route.useSearch()
    const {
        shop,
        orders,
        records,
        total,
        busyId,
        handleFilterChange,
        onPageChange,
        ship,
        agreeAfterSale,
        rejectAfterSale,
        receiveReturn,
    } = useOrderList(search)
    const [shipTarget, setShipTarget] = useState<SellerOrderListItemResponse | undefined>()
    const [confirm, setConfirm] = useState<SaleConfirm | undefined>()

    if (!shop) {
        return <ShopRequired />
    }

    // 关弹窗由弹窗自己收尾（确认后 onOpenChange(false)）：这里只管把动作路由到对应 mutation
    const runConfirm = () => {
        if (!confirm) return
        if (confirm.kind === "agree") agreeAfterSale(confirm.order.id)
        else if (confirm.kind === "reject") rejectAfterSale(confirm.order.id)
        else receiveReturn(confirm.order.id)
    }

    return (
        <div className="space-y-5">
            <OrderFilterBar
                value={search.status}
                onChange={handleFilterChange}
            />

            {orders.isError ? (
                <StateError
                    message={toApiError(orders.error).detail}
                    onRetry={() => void orders.refetch()}
                    retrying={orders.isFetching}
                />
            ) : orders.isLoading ? (
                <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton
                            key={i}
                            className="h-14 w-full rounded-xl"
                        />
                    ))}
                </div>
            ) : records.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <PackageOpen />
                        </EmptyMedia>
                        <EmptyTitle>没有符合条件的订单</EmptyTitle>
                        <EmptyDescription>换个筛选状态试试</EmptyDescription>
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
                    onAgreeAfterSale={(o) => setConfirm({ order: o, kind: "agree" })}
                    onRejectAfterSale={(o) => setConfirm({ order: o, kind: "reject" })}
                    onReceiveReturn={(o) => setConfirm({ order: o, kind: "receive" })}
                />
            )}

            <ShipDialog
                open={Boolean(shipTarget)}
                order={shipTarget}
                onOpenChange={(open) => !open && setShipTarget(undefined)}
                onShip={ship}
            />

            <AfterSaleDecisionDialog
                open={Boolean(confirm)}
                onOpenChange={(open) => !open && setConfirm(undefined)}
                kind={confirm?.kind ?? "agree"}
                orderId={confirm?.order.id}
                orderNo={confirm?.order.orderNo}
                shopId={shop.id}
                onConfirm={runConfirm}
            />
        </div>
    )
}
