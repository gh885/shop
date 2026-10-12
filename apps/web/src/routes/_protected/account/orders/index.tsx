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
    /** 页签与页码进 URL：脏值收敛为初态，不把用户挡在错误页外 */
    validateSearch: parseOrdersSearch,
    // 客户端预热（受保护页 SSR 服务端拿不到 token，loader 在服务端直接跳过）：
    // 只预取默认「全部」页签第一页；切页签/翻页是新 queryKey，由组件侧按需拉取。
    // query() 失败会 reject —— 预热而已，吞掉；错误仍由组件侧的就地错误态处理。
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
    // 页签页码以 URL 为唯一真源；切换动作只改 URL，派生由 useSearch 完成
    const setTab = (tab: OrderTab) => void navigate({ search: { tab, page: 1 } })
    const setPage = (page: number) => void navigate({ search: { tab: search.tab, page } })

    const { data, isLoading } = useQuery(myOrdersOptions({ status: search.tab, page: search.page }))
    const { handleAction, pendingAction, cancelDialog } = useOrderActions()

    // 按后端返回直接渲染（后端已按 status 过滤）
    const orders: Order[] = data?.records ?? []
    const totalPages = pageCount(data?.total, MY_ORDERS_PAGE_SIZE)

    // 越界页码收口：数据到达后才钳制（旧链接 ?page=99、取消/流转后列表收缩留下的页码）。
    // 用 replace 不留历史——修正进历史栈会造出「后退→被弹回」的死循环。
    useOutOfRangePageGuard({
        page: search.page,
        total: data?.total,
        size: MY_ORDERS_PAGE_SIZE,
        onFix: (page) => void navigate({ search: { tab: search.tab, page }, replace: true }),
    })

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("account.menu.orders")}</h2>

            {/* 取消订单弹窗（原因 + 备注）：状态由 useOrderActions 持有，这里只挂渲染位 */}
            {cancelDialog}

            {/* 状态 Tab 导航 */}
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
                    {/* 占位骨架：数据未到，无稳定 key 可用，index 合法 */}
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
