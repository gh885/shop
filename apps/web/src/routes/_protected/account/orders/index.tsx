import {
    myOrdersOptions,
    useOrderActions,
    MY_ORDERS_PAGE_SIZE,
    ORDER_STATUS_TABS,
    OrderCard,
    type Order,
} from "#/order"
import { parseOrdersSearch, type OrderTab } from "#/order/orders-search"

import { createFileRoute, useSearch } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { orderTabEmptyText, orderTabLabel } from "#/order/order-label"
import { noop, useQuery } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import { pageCount, PaginationBar, useOutOfRangePageGuard } from "@shop/app-kit/data"
import {
    Skeleton,
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    Button,
    Tabs,
    TabsList,
    TabsTrigger,
} from "@shop/ui-web"

export const Route = createFileRoute("/_protected/account/orders/")({
    validateSearch: parseOrdersSearch,
    loader: ({ context }) => {
        if (import.meta.env.SSR) return
        void context.queryClient.query(myOrdersOptions({ status: "all" })).catch(noop)
    },
    component: OrdersPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.orders", match.context.locale) }],
    }),
})

function OrdersPage() {
    const t = useT()
    const search = useSearch({ from: "/_protected/account/orders/" })
    const navigate = Route.useNavigate()
    const setTab = (tab: OrderTab) => void navigate({ search: { tab, page: 1 } })
    const setPage = (page: number) => void navigate({ search: { tab: search.tab, page } })

    const { data, isLoading } = useQuery(myOrdersOptions({ status: search.tab, page: search.page }))
    const { handleAction, pendingAction, cancelDialog } = useOrderActions()

    const orders: Order[] = data?.records ?? []
    const totalPages = pageCount(data?.total, MY_ORDERS_PAGE_SIZE)

    useOutOfRangePageGuard({
        page: search.page,
        total: data?.total,
        size: MY_ORDERS_PAGE_SIZE,
        onFix: (page) => void navigate({ search: { tab: search.tab, page }, replace: true }),
    })

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("account.menu.orders")}</h2>

            {cancelDialog}

            <Tabs
                value={search.tab}
                onValueChange={(value) => {
                    const next = ORDER_STATUS_TABS.find((tab) => tab === value)
                    if (next) setTab(next)
                }}
            >
                <TabsList
                    variant="line"
                    className="min-h-10 w-full justify-start"
                >
                    {ORDER_STATUS_TABS.map((tab) => (
                        <TabsTrigger
                            key={tab}
                            value={tab}
                            size="lg"
                        >
                            {orderTabLabel(tab, t)}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {isLoading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton
                            /* eslint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key */
                            key={i}
                            className="h-40 w-full rounded-lg"
                        />
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <CircleAlert />
                        </EmptyMedia>
                        <EmptyTitle>
                            {search.tab === "all"
                                ? t("account.orders.emptyAll")
                                : orderTabEmptyText(search.tab, t)}
                        </EmptyTitle>
                        <EmptyDescription>{t("account.orders.emptyDescription")}</EmptyDescription>
                        <Button
                            className="mt-2"
                            onClick={() => void navigate({ to: "/" })}
                        >
                            {t("account.empty.browse")}
                        </Button>
                    </EmptyHeader>
                </Empty>
            ) : (
                <>
                    <div className="space-y-4">
                        {orders.map((order) => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                pendingAction={pendingAction}
                                onDetail={() =>
                                    void navigate({
                                        to: "/orders/$orderId",
                                        params: { orderId: order.id },
                                    })
                                }
                                onAction={(action) => handleAction(order, action)}
                            />
                        ))}
                    </div>
                    <PaginationBar
                        page={search.page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                </>
            )}
        </div>
    )
}
