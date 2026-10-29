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
import { useOrderList } from "#/domains/order/list/use-order-list"
import { orderListSearchSchema } from "#/domains/order/search"
import { useShop } from "#/domains/shop"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/trade/order")({
    validateSearch: orderListSearchSchema,
    component: OrdersPage,
})

function OrdersPage() {
    const t = useT()
    const search = Route.useSearch()
    const shop = useShop()
    const {
        orders,
        records,
        nextCursor,
        busyId,
        phones,
        handleFilterChange,
        onLoadMore,
        ship,
        revealPhone,
        revealPhoneFor,
    } = useOrderList(shop.id, search)
    const [shipTarget, setShipTarget] = useState<OrderIdentity | undefined>()

    return (
        <div className="space-y-5">
            <OrderFilterBar
                value={search.status}
                onChange={handleFilterChange}
            />

            {orders.isPending ? (
                <DataTableSkeleton columns={5} />
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
                    nextCursor={nextCursor}
                    busyId={busyId}
                    onLoadMore={onLoadMore}
                    onShip={setShipTarget}
                    onRevealPhone={(o) => revealPhone(o.sellerOrderId)}
                    revealingId={revealPhoneFor}
                    phones={phones}
                />
            )}

            <ShipDialog
                open={Boolean(shipTarget)}
                order={shipTarget}
                onOpenChange={(open) => !open && setShipTarget(undefined)}
                onShip={ship}
            />
        </div>
    )
}
