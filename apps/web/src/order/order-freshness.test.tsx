import type { OrderDetailResponse } from "@shop/api/sdk"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vite-plus/test"
import { server } from "@shop/test-utils"
import { createAppTestQueryClient } from "@shop/app-kit/test"
import { orderDetailOptions } from "./queries"

const ID = "00000000-0000-4000-8000-000000000001"
const response: OrderDetailResponse = {
    id: ID,
    tradeId: ID,
    orderNo: "NO20260906001",
    status: "PAID",
    tradeStatus: "PAID",
    shopId: ID,
    shopName: "测试店",
    availableActions: ["RECEIVE"],
    itemAmount: { amount: 20000, currency: "CNY" },
    shippingFee: { amount: 1000, currency: "CNY" },
    discountAmount: { amount: 3000, currency: "CNY" },
    payAmount: { amount: 18000, currency: "CNY" },
    userCouponId: null,
    buyerMessage: null,
    receiverName: "张三",
    receiverPhone: "13800000000",
    receiverProvince: "广东省",
    receiverCity: "深圳市",
    receiverDistrict: "南山区",
    receiverDetail: "科技园 1 号",
    logisticsCompany: null,
    trackingNo: null,
    payExpireAt: "2026-09-06T12:00:00Z",
    paidAt: "2026-09-06T12:05:00Z",
    shipExpireAt: "2026-09-09T12:05:00Z",
    shippedAt: null,
    receiveExpireAt: null,
    canExtendReceive: false,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: "2026-09-06T11:30:00Z",
    afterSaleBadge: "NONE",
    refundedAmount: { amount: 0, currency: "CNY" },
    compensatedAmount: { amount: 0, currency: "CNY" },
    applyExpireAt: null,
    items: [
        {
            orderItemId: "00000000-0000-7000-8000-000000000001",
            productId: ID,
            skuId: ID,
            name: "测试商品",
            image: null,
            price: { amount: 20000, currency: "CNY" },
            originalPrice: null,
            quantity: 1,
            shippedQuantity: 1,
            refundedQuantity: 0,
            amount: { amount: 20000, currency: "CNY" },
        },
    ],
}

describe("订单导航缓存新鲜度", () => {
    it("详情复用有效缓存，但必须重新读取已失效的待付款快照", async () => {
        const client = createAppTestQueryClient()
        // 「待付款」不是子订单状态（子订单创建即待发货），而是主订单状态：快照按 tradeStatus 走
        let tradeStatus: OrderDetailResponse["tradeStatus"] = "PENDING_PAYMENT"
        let reads = 0
        server.use(
            http.get("*/orders/:id", () => {
                reads++
                return HttpResponse.json({ ...response, tradeStatus })
            }),
        )
        const options = orderDetailOptions(ID, Infinity)
        expect((await client.query(options)).status).toBe("pending_payment")
        await client.query(options)
        expect(reads).toBe(1)
        tradeStatus = "PAID"
        await client.invalidateQueries({ queryKey: options.queryKey })
        expect((await client.query(options)).status).toBe("pending_shipment")
        expect(reads).toBe(2)
        client.clear()
    })

    it("收银台即使缓存未过期，也读取后端最新金额和订单状态", async () => {
        const client = createAppTestQueryClient()
        let amount = 5590
        server.use(
            http.get("*/orders/:id", () =>
                HttpResponse.json({ ...response, payAmount: { amount, currency: "CNY" } }),
            ),
        )
        expect((await client.query(orderDetailOptions(ID))).payAmount.amount).toBe(5590)
        amount = 4990
        expect((await client.query(orderDetailOptions(ID, 0))).payAmount.amount).toBe(4990)
        client.clear()
    })
})
