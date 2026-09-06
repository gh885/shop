import type { OrderDetailResponse, OrderListItemResponse } from "@shop/api/sdk"
import { describe, expect, it } from "vitest"

import { ORDER_PROGRESS_STEP, ORDER_STATUS_LABEL } from "./model"
import { statusToWire, toOrder, toOrderDetail } from "./order"

/**
 * 测试夹具：订单 wire 形状可控构造。
 * 关心维度：状态枚举（PAID → pending_shipment 是投影语义的关键）、快照字段、可空字段。
 */
const MONEY = { amount: 19900, currency: "CNY" }

function makeItemDto(
    opts: { name?: string; image?: string | null; quantity?: number } = {},
): OrderListItemResponse["items"][number] {
    return {
        productId: "p-1",
        skuId: "sku-1",
        name: opts.name ?? "测试商品",
        image: opts.image ?? null,
        price: MONEY,
        originalPrice: MONEY,
        quantity: opts.quantity ?? 1,
        amount: MONEY,
    }
}

function makeListDto(
    opts: {
        status?: string
        shopName?: string | null
        items?: ReturnType<typeof makeItemDto>[]
    } = {},
): OrderListItemResponse {
    return {
        id: "o-1",
        orderNo: "NO20260906001",
        status: opts.status ?? "PENDING_PAYMENT",
        shopId: "shop-1",
        shopName: "shopName" in opts ? (opts.shopName ?? null) : "测试店",
        payAmount: MONEY,
        payExpireAt: "2026-09-06T12:00:00Z",
        createdAt: "2026-09-06T11:30:00Z",
        items: opts.items ?? [makeItemDto()],
    }
}

function makeDetailDto(opts: Partial<OrderDetailResponse> = {}): OrderDetailResponse {
    return {
        ...makeListDto(),
        availableActions: ["PAY", "CANCEL"],
        itemAmount: MONEY,
        shippingFee: { amount: 0, currency: "CNY" },
        buyerMessage: null,
        receiverName: "张三",
        receiverPhone: "13800000000",
        receiverProvince: "广东省",
        receiverCity: "深圳市",
        receiverDistrict: "南山区",
        receiverDetail: "科技园 1 号",
        logisticsCompany: null,
        trackingNo: null,
        paidAt: null,
        shippedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelReason: null,
        afterSaleStatus: "NONE",
        afterSaleType: "REFUND_ONLY",
        refundAmount: MONEY,
        afterSaleRefundedAt: null,
        applyExpireAt: null,
        returnLogisticsCompany: null,
        returnTrackingNo: null,
        ...opts,
    }
}

describe("toOrder（列表项投影）", () => {
    it("后端 PAID 投影为前端 pending_shipment（履约流无独立已付款段）", () => {
        expect(toOrder(makeListDto({ status: "PAID" })).status).toBe("pending_shipment")
    })

    it("全部 wire 状态映射不串位", () => {
        expect(toOrder(makeListDto({ status: "PENDING_PAYMENT" })).status).toBe("pending_payment")
        expect(toOrder(makeListDto({ status: "SHIPPED" })).status).toBe("pending_receipt")
        expect(toOrder(makeListDto({ status: "COMPLETED" })).status).toBe("completed")
        expect(toOrder(makeListDto({ status: "CANCELLED" })).status).toBe("cancelled")
    })

    it("行项主图 null 归一为 undefined，title 来自 wire 的 name", () => {
        const order = toOrder(makeListDto({ items: [makeItemDto({ image: "img/a.png" })] }))

        expect(order.items[0]).toMatchObject({ title: "测试商品", image: "img/a.png" })
        expect(toOrder(makeListDto()).items[0]?.image).toBeUndefined()
    })

    it("店铺注销时 shopName 如实透传 null，不造假名", () => {
        expect(toOrder(makeListDto({ shopName: null })).shopName).toBeNull()
    })

    it("金额与时间戳原样透传", () => {
        const dto = makeListDto()

        expect(toOrder(dto)).toMatchObject({
            payAmount: MONEY,
            payExpireAt: "2026-09-06T12:00:00Z",
            createdAt: "2026-09-06T11:30:00Z",
        })
    })
})

describe("toOrderDetail（详情投影）", () => {
    it("在列表形状之上扩展收货快照与动作集", () => {
        const detail = toOrderDetail(makeDetailDto())

        expect(detail).toMatchObject({
            receiverName: "张三",
            receiverPhone: "13800000000",
            availableActions: ["PAY", "CANCEL"],
        })
        expect(detail.items).toHaveLength(1)
    })

    it("未发货时物流字段如实透传 null", () => {
        const detail = toOrderDetail(makeDetailDto())

        expect(detail.logisticsCompany).toBeNull()
        expect(detail.trackingNo).toBeNull()
    })

    it("取消原因与取消时间可带回", () => {
        const detail = toOrderDetail(
            makeDetailDto({
                status: "CANCELLED" as OrderDetailResponse["status"],
                cancelledAt: "2026-09-06T11:40:00Z",
                cancelReason: "不想要了",
            }),
        )

        expect(detail.cancelReason).toBe("不想要了")
        expect(detail.cancelledAt).toBe("2026-09-06T11:40:00Z")
    })
})

describe("statusToWire（领域 → wire 回传）", () => {
    it("双向映射互逆：pending_shipment 回传 PAID 而不是别的", () => {
        expect(statusToWire("pending_shipment")).toBe("PAID")
        expect(statusToWire("pending_payment")).toBe("PENDING_PAYMENT")
        expect(statusToWire("pending_receipt")).toBe("SHIPPED")
        expect(statusToWire("completed")).toBe("COMPLETED")
        expect(statusToWire("cancelled")).toBe("CANCELLED")
    })
})

describe("展示辅助", () => {
    it("每个状态都有中文标签，且取消态不进入进度条（step -1）", () => {
        expect(ORDER_STATUS_LABEL.pending_shipment).toBe("待发货")
        expect(ORDER_STATUS_LABEL.completed).toBe("交易成功")
        expect(ORDER_PROGRESS_STEP.cancelled).toBe(-1)
        expect(ORDER_PROGRESS_STEP.completed).toBe(3)
    })
})
