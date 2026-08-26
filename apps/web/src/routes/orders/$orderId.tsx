import { createFileRoute } from "@tanstack/react-router"

import { AccountHeader } from "#/widgets/account"
import type { OrderDetail } from "#/entities/order"
import {
    OrderProgress,
    OrderShopSection,
    OrderStatusSection,
    OrderSummaryCard,
} from "#/features/orders/detail"
import { requireAuth } from "#/shared/api/auth"
import { notify } from "#/shared/lib/toast"

function notifyOrderAction(_order: unknown, action: string) {
    notify.info(`「${action}」即将上线`)
}

export const Route = createFileRoute("/orders/$orderId")({
    beforeLoad: () => requireAuth(),
    component: OrderDetailPage,
    head: () => ({
        meta: [{ title: "订单详情 - Shop" }],
    }),
})

/** 订单详情页：独立页面（不走 account 侧边栏布局），左进度/状态/商品，右侧信息卡 */
function OrderDetailPage() {
    const { orderId } = Route.useParams()
    const order = mockDetail(orderId)

    return (
        <div className="flex flex-1 flex-col">
            <AccountHeader
                title="订单详情"
                widthClass="max-w-[1184px]"
            />

            <div className="mx-auto w-full max-w-[1184px] flex-1 px-6 py-8">
                <div className="flex gap-8">
                    {/* 左侧主区 */}
                    <div className="min-w-0 flex-1 space-y-8">
                        {/* 进度条 + 状态 + 地址 + 操作 */}
                        <div className="space-y-6 rounded-xl bg-background p-6">
                            <OrderProgress status={order.status} />
                            <OrderStatusSection
                                order={order}
                                onAction={notifyOrderAction}
                            />
                        </div>

                        {/* 店铺 + 商品 */}
                        <OrderShopSection
                            order={order}
                            items={order.items}
                            onItemAction={notifyOrderAction}
                        />
                    </div>

                    {/* 右侧信息卡 */}
                    <aside className="w-80 shrink-0">
                        <OrderSummaryCard order={order} />
                    </aside>
                </div>
            </div>
        </div>
    )
}

// TODO: 后端 /orders/{id} 接口接入后替换为 useOrderDetail(); 此处为临时占位
function mockDetail(orderId: string): OrderDetail {
    const base = {
        id: orderId,
        orderNo: orderId || "2364889262174095366",
        createdAt: "2024-11-10T14:23:00+08:00",
        status: "completed" as const,
        shopId: "aaaa1111-bbbb-4ccc-8ddd-000000000001",
        shopName: "丹山新华书店图书专营店",
        itemCount: 1,
        totalAmount: { amount: 2100, currency: "CNY" },
        payAmount: { amount: 2100, currency: "CNY" },
        shippingFee: { amount: 0, currency: "CNY" },
        items: [
            {
                id: "7b2e5d4a-1001-4c3b-9a01-000000000001",
                productId: "7b2e5d4a-2001-4c3b-9a01-000000000001",
                skuId: null,
                title: "【新华书店 官方正版】蛙 莫言全集余华新书 不被大风吹倒情书荆棘乳膀胱女人蛙",
                image: "",
                spec: "",
                tags: ["假一赔四", "极速退款", "7天无理由退换"],
                price: { amount: 2100, currency: "CNY" },
                originalPrice: null,
                quantity: 1,
            },
        ],
        receiver: {
            name: "g",
            phone: "86-195****1956",
            address: "山西省 晋中市 昔阳县 乐平镇 中通快递南关店",
        },
        payMethod: "支付宝",
        payTxnNo: "20250726220011495514000577166",
        services: ["假一赔四"],
        payTime: "2025-07-26T18:48:37+08:00",
        shipTime: "2025-07-27T09:36:18+08:00",
        finishTime: "2025-08-06T09:36:24+08:00",
    }
    return base as OrderDetail
}
