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
import { OrderStatus } from "@shop/api/sdk"
import { paginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"

import { useT } from "#/locales/use-t"
import { OrderTable, type OrderIdentity } from "#/order/list/table"
import { OrderFilterBar } from "#/order/list/filter"
import { ShipDialog } from "#/order/list/ship-dialog"
import { AfterSaleDecisionDialog } from "#/order/after-sale-decision-dialog"
import type { SaleDecisionKind } from "#/order/after-sale-decision"
import { useOrderList, type OrderListSearch } from "#/order/list/use-order-list"
import { useShop } from "#/shop"
import { useState } from "react"

const listSearchSchema = paginationSearchSchema.extend({
    // status 枚举取生成物 OrderStatus，别抄字面量数组：后端加状态时手抄的会漏、URL 筛选值被 .catch 静默吃掉
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z.enum(OrderStatus).optional().catch(undefined),
})

export const Route = createFileRoute("/_app/trade/order")({
    validateSearch: (search: Record<string, unknown>): OrderListSearch =>
        listSearchSchema.parse(search),
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
