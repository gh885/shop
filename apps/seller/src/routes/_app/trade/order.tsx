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
import { paginationSearchSchema } from "@shop/app-kit"
import { z } from "zod"

import { OrderTable, type OrderIdentity } from "#/order/list/table"
import { OrderFilterBar } from "#/order/list/filter"
import { ShipDialog } from "#/order/list/ship-dialog"
import { AfterSaleDecisionDialog } from "#/order/after-sale-decision-dialog"
import type { SaleDecisionKind } from "#/order/after-sale-decision"
import { useOrderList, type OrderListSearch } from "#/order/list/use-order-list"
import { useShop } from "#/shop"
import { useState } from "react"

const listSearchSchema = paginationSearchSchema.extend({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z
        .enum(["PENDING_PAYMENT", "PAID", "SHIPPED", "COMPLETED", "CANCELLED"])
        .optional()
        .catch(undefined),
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
type SaleConfirm = { orderId: string; orderNo: string; kind: SaleDecisionKind }

function OrdersPage() {
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
        afterSaleActionsOf,
        agreeAfterSale,
        rejectAfterSale,
        receiveReturn,
        revealPhone,
        revealPhoneFor,
    } = useOrderList(shop.id, search)
    const [shipTarget, setShipTarget] = useState<OrderIdentity | undefined>()
    const [confirm, setConfirm] = useState<SaleConfirm | undefined>()

    // 关弹窗由弹窗自己收尾（确认后 onOpenChange(false)）：这里只管把动作路由到对应 mutation，
    // 拒绝那一路把弹窗收的必填理由一起带过去
    const runConfirm = (reason: string) => {
        if (!confirm) return
        if (confirm.kind === "agree") agreeAfterSale(confirm.orderId)
        else if (confirm.kind === "reject") rejectAfterSale(confirm.orderId, reason)
        else receiveReturn(confirm.orderId)
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
