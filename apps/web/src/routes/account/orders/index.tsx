import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"

import type { Order, OrderStatus } from "#/entities/order"
import { ORDER_STATUS_LABEL } from "#/entities/order"
import { OrderCard } from "#/features/orders"
import { requireAuth } from "#/shared/api/auth"
import { notify } from "#/shared/lib/toast"

export const Route = createFileRoute("/account/orders/")({
    beforeLoad: () => requireAuth(),
    component: OrdersPage,
    head: () => ({
        meta: [{ title: "我的订单 - 个人中心 - Shop" }],
    }),
})

/** 状态 Tab：全部 + 各状态 */
const STATUS_TABS: { key: OrderStatus | "all"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "pending_payment", label: "待付款" },
    { key: "pending_shipment", label: "待发货" },
    { key: "pending_receipt", label: "待收货" },
    { key: "pending_review", label: "待评价" },
]

function OrdersPage() {
    const [tab, setTab] = useState<OrderStatus | "all">("all")
    const navigate = useNavigate()

    const orders: Order[] = MockOrders

    // 按状态 Tab 过滤
    const filtered = tab === "all" ? orders : orders.filter((o) => o.status === tab)

    return (
        <div className="space-y-4">
            <h1 className="text-xl font-bold">我的订单</h1>

            {/* 状态 Tab 导航 */}
            <div className="flex gap-1 border-b border-border/60">
                {STATUS_TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`-mb-px border-b-2 px-4 pb-2.5 text-sm transition-colors ${
                            tab === t.key
                                ? "border-primary font-medium text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <CircleAlert />
                        </EmptyMedia>
                        <EmptyTitle>
                            {tab === "all" ? "暂无订单" : `暂无${ORDER_STATUS_LABEL[tab]}订单`}
                        </EmptyTitle>
                        <EmptyDescription>去逛逛，把心仪好物带回家。</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="space-y-4">
                    {filtered.map((order) => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            onDetail={(o) =>
                                void navigate({
                                    to: "/orders/$orderId",
                                    params: { orderId: o.id },
                                })
                            }
                            onAction={(_order, action) => notify.info(`「${action}」即将上线`)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// TODO: 后端 /orders 接口接入后替换为 useOrders()；此处为临时占位数据
const MockOrders: Order[] = [
    {
        id: "7b2e5d4a-1000-4c3b-9a01-000000000001",
        orderNo: "2364889262174095366",
        createdAt: "2024-11-10T14:23:00+08:00",
        status: "completed",
        shopId: "aaaa1111-bbbb-4ccc-8ddd-000000000001",
        shopName: "新华文轩旗舰店",
        itemCount: 2,
        totalAmount: { amount: 3420, currency: "CNY" },
        payAmount: { amount: 3420, currency: "CNY" },
        shippingFee: { amount: 0, currency: "CNY" },
        items: [
            {
                id: "7b2e5d4a-1001-4c3b-9a01-000000000001",
                productId: "7b2e5d4a-2001-4c3b-9a01-000000000001",
                skuId: null,
                title: "【狂欢价】【新华文轩】局外人 加缪正版 柳鸣九诺贝尔文学奖获奖者荒谬主义文学外国文学经典小说鼠疫西西弗神话现当代文学 [交易快照]",
                image: "",
                spec: "局外人",
                tags: ["退货宝", "大促价保", "7天无理由退换"],
                price: { amount: 1476, currency: "CNY" },
                originalPrice: { amount: 1600, currency: "CNY" },
                quantity: 1,
            },
            {
                id: "7b2e5d4a-1002-4c3b-9a01-000000000002",
                productId: "7b2e5d4a-2002-4c3b-9a01-000000000002",
                skuId: null,
                title: "【狂欢价】大卫科波菲尔+老人与海+复活+百年孤独 查尔斯狄更斯海明威列夫托尔斯泰加西亚马尔克斯初高中课外阅读世界名著 [交易快照]",
                image: "",
                spec: "",
                tags: ["退货宝", "大促价保", "7天无理由退换"],
                price: { amount: 1944, currency: "CNY" },
                originalPrice: { amount: 2150, currency: "CNY" },
                quantity: 1,
            },
        ],
    },
    {
        id: "7b2e5d4a-2000-4c3b-9a01-000000000003",
        orderNo: "2364889262174095377",
        createdAt: "2024-12-01T09:12:00+08:00",
        status: "pending_receipt",
        shopId: "aaaa1111-bbbb-4ccc-8ddd-000000000002",
        shopName: "三星官方旗舰店",
        itemCount: 1,
        totalAmount: { amount: 499000, currency: "CNY" },
        payAmount: { amount: 499000, currency: "CNY" },
        shippingFee: { amount: 0, currency: "CNY" },
        items: [
            {
                id: "7b2e5d4a-2001-4c3b-9a01-000000000003",
                productId: "7b2e5d4a-3001-4c3b-9a01-000000000003",
                skuId: null,
                title: "三星 Galaxy S24 Ultra 12GB+256GB 钛灰 骁龙8 Gen3 智能 AI 手机",
                image: "",
                spec: "颜色:钛灰 存储:12GB+256GB",
                tags: ["官方旗舰", "全国联保"],
                price: { amount: 499000, currency: "CNY" },
                originalPrice: null,
                quantity: 1,
            },
        ],
    },
]
