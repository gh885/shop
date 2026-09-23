import {
    myOrdersOptions,
    useOrderActions,
    ORDER_STATUS_LABEL,
    ORDER_STATUS_TABS,
    OrderCard,
    type Order,
} from "#/order"
import { outOfRangePage, parseOrdersSearch, type OrderTab } from "#/order/orders-search"

import { createFileRoute, useSearch } from "@tanstack/react-router"
import { noop, useQuery } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import { useEffect } from "react"
import { PaginationBar } from "@shop/app-kit"
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
    head: () => ({
        meta: [{ title: "我的订单 - 个人中心 - Shop" }],
    }),
})

function OrdersPage() {
    const search = useSearch({ from: "/_protected/account/orders/" })
    const navigate = Route.useNavigate()
    // 页签页码以 URL 为唯一真源；切换动作只改 URL，派生由 useSearch 完成
    const setTab = (tab: OrderTab) => void navigate({ search: { tab, page: 1 } })
    const setPage = (page: number) => void navigate({ search: { tab: search.tab, page } })

    const { data, isLoading } = useQuery(myOrdersOptions({ status: search.tab, page: search.page }))
    const { handleAction, pendingAction, cancelDialog } = useOrderActions()

    // 按后端返回直接渲染（后端已按 status 过滤）
    const orders: Order[] = data?.records ?? []
    const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 0

    // 越界页码收口：数据到达后才钳制（旧链接 ?page=99、列表收缩后残留的页码），用 replace 不留历史
    useEffect(() => {
        const fixed = data ? outOfRangePage(search.page, totalPages) : undefined
        if (fixed !== undefined)
            void navigate({ search: { tab: search.tab, page: fixed }, replace: true })
    }, [data, search.page, search.tab, totalPages, navigate])

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">我的订单</h2>

            {/* 取消订单弹窗（原因 + 备注）：状态由 useOrderActions 持有，这里只挂渲染位 */}
            {cancelDialog}

            {/* 状态 Tab 导航 */}
            <Tabs
                value={search.tab}
                onValueChange={(value) => {
                    const next = ORDER_STATUS_TABS.find((t) => t.key === value)?.key
                    if (next) setTab(next)
                }}
            >
                <TabsList
                    variant="line"
                    className="min-h-10 w-full justify-start"
                >
                    {ORDER_STATUS_TABS.map((t) => (
                        <TabsTrigger
                            key={t.key}
                            value={t.key}
                            size="lg"
                        >
                            {t.label}
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
                                ? "暂无订单"
                                : `暂无${ORDER_STATUS_LABEL[search.tab]}订单`}
                        </EmptyTitle>
                        <EmptyDescription>去逛逛，把心仪好物带回家。</EmptyDescription>
                        <Button
                            className="mt-2"
                            onClick={() => void navigate({ to: "/" })}
                        >
                            去逛逛
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
