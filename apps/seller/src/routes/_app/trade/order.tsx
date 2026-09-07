import { createFileRoute } from "@tanstack/react-router"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
    StateError,
} from "@shop/ui-web"
import { PackageOpen, Store } from "lucide-react"
import { z } from "zod"
import type { SellerOrderListItemResponse } from "@shop/api/sdk"
import { toApiError } from "@shop/common"

import { OrderTable } from "#/order/list/table"
import { OrderFilterBar } from "#/order/list/filter"
import { ShipDialog } from "#/order/list/ship-dialog"
import { useOrderList, type OrderListSearch } from "#/order/list/use-order-list"
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

type SaleConfirm = { order: SellerOrderListItemResponse; kind: "agree" | "reject" | "receive" }
const SALE_CONFIRM_TEXT: Record<SaleConfirm["kind"], { title: string; desc: string }> = {
    agree: {
        title: "同意售后",
        desc: "确定同意该订单的售后申请吗？仅退款将直接退款；退货退款将进入退货流程。",
    },
    reject: { title: "拒绝售后", desc: "确定拒绝该订单的售后申请吗？拒绝后买家不可再次申请。" },
    receive: { title: "确认收货", desc: "确定确认收到退回商品吗？将回补库存并给买家退款。" },
}

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
        return (
            <Empty className="py-24">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Store />
                    </EmptyMedia>
                    <EmptyTitle>还没有正常营业的店铺</EmptyTitle>
                    <EmptyDescription>先到「店铺管理」创建店铺或等待审核通过。</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    const runConfirm = () => {
        if (!confirm) return
        if (confirm.kind === "agree") agreeAfterSale(confirm.order.id)
        else if (confirm.kind === "reject") rejectAfterSale(confirm.order.id)
        else receiveReturn(confirm.order.id)
        setConfirm(undefined)
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

            <AlertDialog
                open={Boolean(confirm)}
                onOpenChange={(open) => !open && setConfirm(undefined)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirm ? SALE_CONFIRM_TEXT[confirm.kind].title : ""}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm ? SALE_CONFIRM_TEXT[confirm.kind].desc : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={runConfirm}
                        >
                            确定
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
