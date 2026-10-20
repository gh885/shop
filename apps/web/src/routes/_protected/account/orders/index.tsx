import {
    myTradesOptions,
    useOrderActions,
    MY_TRADES_PAGE_SIZE,
    ORDER_TABS,
    TradeCard,
    type Trade,
} from "#/domains/order"
import { parseOrdersSearch, type OrderTab } from "#/domains/order/search"

import { createFileRoute, useSearch } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { orderTabEmptyText, orderTabLabel } from "#/domains/order/order-label"
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
        void context.queryClient.query(myTradesOptions({ tab: "all" })).catch(noop)
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

    const { data, isLoading } = useQuery(myTradesOptions({ tab: search.tab, page: search.page }))
    const { handleAction, pendingAction, cancelDialog } = useOrderActions()

    const trades: Trade[] = data?.records ?? []
    const totalPages = pageCount(data?.total, MY_TRADES_PAGE_SIZE)

    useOutOfRangePageGuard({
        page: search.page,
        total: data?.total,
        size: MY_TRADES_PAGE_SIZE,
        onFix: (page) => void navigate({ search: { tab: search.tab, page }, replace: true }),
    })

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("account.menu.orders")}</h2>

            {cancelDialog}

            <Tabs
                value={search.tab}
                onValueChange={(value) => {
                    const next = ORDER_TABS.find((tab) => tab === value)
                    if (next) setTab(next)
                }}
            >
                <TabsList
                    variant="line"
                    className="min-h-10 w-full justify-start overflow-x-auto"
                >
                    {ORDER_TABS.map((tab) => (
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
            ) : trades.length === 0 ? (
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
                        {trades.map((trade) => (
                            <TradeCard
                                key={trade.id}
                                trade={trade}
                                pendingAction={pendingAction}
                                onDetail={(orderId) =>
                                    void navigate({
                                        to: "/orders/$orderId",
                                        params: { orderId },
                                    })
                                }
                                onAction={(orderId, action) =>
                                    handleAction(tradeOrderOf(trade, orderId), action)
                                }
                                onPay={(tradeId) =>
                                    void navigate({
                                        to: "/pay/$tradeId",
                                        params: { tradeId },
                                    })
                                }
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

/** 卡片里的店铺段 → 动作入参：tradeId 由所在的卡提供，子订单只补自己的 id 与单号 */
function tradeOrderOf(trade: Trade, orderId: string) {
    const order = trade.orders.find((o) => o.id === orderId)
    if (!order) throw new Error(`订单 ${orderId} 不在主订单 ${trade.id} 下`)
    return { id: order.id, orderNo: order.orderNo, tradeId: trade.id }
}
