import { myTradesOptions, useOrderActions, ORDER_TABS, TradeCard } from "#/domains/order"
import { parseOrdersSearch, type OrderTab } from "#/domains/order/search"

import { createFileRoute, useSearch } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { orderTabEmptyText, orderTabLabel } from "#/domains/order/order-label"
import { noop, useQuery } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import {
    Button,
    Skeleton,
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    Tabs,
    TabsList,
    TabsTrigger,
} from "@shop/ui-web"

export const Route = createFileRoute("/_authenticated/account/orders/")({
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
    const search = useSearch({ from: "/_authenticated/account/orders/" })
    const navigate = Route.useNavigate()
    const setTab = (tab: OrderTab) => void navigate({ search: { tab, cursor: undefined } })

    const { data, isLoading } = useQuery(
        myTradesOptions({ tab: search.tab, cursor: search.cursor }),
    )
    const { pendingAction, cancelDialog } = useOrderActions()

    const trades = data?.records ?? []

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
                            onPay={(tradeId) =>
                                void navigate({
                                    to: "/pay/$tradeId",
                                    params: { tradeId },
                                })
                            }
                        />
                    ))}
                    {data?.nextCursor && (
                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                onClick={() =>
                                    void navigate({
                                        search: { tab: search.tab, cursor: data.nextCursor! },
                                    })
                                }
                            >
                                {t("common.loadMore")}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
