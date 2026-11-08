import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { SearchSchemaInput } from "@tanstack/react-router"
import { z } from "zod"

import { NotificationsList, notificationsOptions } from "#/domains/notification"
import { translateWeb } from "#/locales"
import type { NotificationView } from "@shop/api/sdk"

// URL 只带翻页游标：通知页没有筛选维度，乱填的参数没有意义
const notificationsSearchSchema = z.object({
    cursor: z.string().optional(),
})

type NotificationsSearchInput = SearchSchemaInput & { cursor?: string }

export const Route = createFileRoute("/_authenticated/notifications/")({
    validateSearch: (search: NotificationsSearchInput) => notificationsSearchSchema.parse(search),
    // 客户端导航时预取一页，SSR 不阻塞首屏（与订单列表同一口径）
    loader: ({ context }) => {
        if (import.meta.env.SSR) return
        void context.queryClient.query(notificationsOptions()).catch(() => undefined)
    },
    component: NotificationsPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.notifications", match.context.locale) }],
    }),
})

function NotificationsPage() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()

    const page = useQuery(notificationsOptions({ cursor: search.cursor ?? "" }))

    // 跳转按 type 解析成类型化路由调用——link 列留给其他端（卖家侧），买家端不信任意字符串路由。
    // 标已读在列表组件里做，页面只管查询与跳转
    function open(item: NotificationView) {
        const orderGroupId =
            typeof item.params.orderGroupId === "string" ? item.params.orderGroupId : undefined
        switch (item.type) {
            case "shipment_recorded":
            case "refund_succeeded":
                if (orderGroupId) {
                    void navigate({ to: "/orders/$orderId", params: { orderId: orderGroupId } })
                }
                break
            case "order_completed":
                void navigate({ to: "/account/reviews", search: { tab: "pending" } })
                break
            default:
                break
        }
    }

    return (
        <NotificationsList
            items={page.data?.items ?? []}
            loading={page.isLoading}
            nextCursor={page.data?.nextCursor}
            onOpen={open}
            onLoadMore={() =>
                void navigate({ search: { cursor: page.data?.nextCursor ?? undefined } })
            }
        />
    )
}
