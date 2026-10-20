import type { OrderDetailResponse } from "@shop/api/sdk"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { renderWithProviders as renderWithBase } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import type { ReactElement } from "react"

import type { OrderDetail } from "./rules"
import { toOrderDetail } from "./mapper"
import { OrderSummaryCard } from "./OrderSummaryCard"

const MONEY = { amount: 19900, currency: "CNY" }

function makeOrderDetail(overrides: Partial<OrderDetailResponse> = {}): OrderDetail {
    return toOrderDetail({
        id: "o-1",
        tradeId: "t-1",
        orderNo: "NO20260906001",
        status: "PAID",
        tradeStatus: "PAID",
        shopId: "shop-1",
        shopName: "测试店",
        availableActions: ["RECEIVE"],
        itemAmount: { amount: 20000, currency: "CNY" },
        shippingFee: { amount: 1000, currency: "CNY" },
        discountAmount: { amount: 3000, currency: "CNY" },
        payAmount: { amount: 18000, currency: "CNY" },
        userCouponId: "uc-1",
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
                productId: "p-1",
                skuId: "sku-1",
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
        ...overrides,
    })
}

function rowText(label: string): string {
    return screen.getByText(label).closest("div")?.textContent ?? ""
}

function renderWithProviders(ui: ReactElement) {
    return renderWithBase(ui, { resources: webMessages })
}

describe("OrderSummaryCard 付款详情", () => {
    it("有券订单_优惠行带负号出现且三行加得起来", () => {
        renderWithProviders(<OrderSummaryCard order={makeOrderDetail()} />)

        expect(rowText("商品总价")).toContain("¥200.00")
        expect(rowText("运费(快递)")).toContain("¥10.00")
        expect(rowText("优惠")).toContain("-¥30.00")
        expect(rowText("实付款")).toContain("¥180.00")
    })

    it("没用券的订单_不画优惠行（0 元优惠是一句废话）", () => {
        renderWithProviders(
            <OrderSummaryCard
                order={makeOrderDetail({
                    discountAmount: { amount: 0, currency: "CNY" },
                    userCouponId: null,
                    itemAmount: MONEY,
                    shippingFee: { amount: 0, currency: "CNY" },
                    payAmount: MONEY,
                })}
            />,
        )

        expect(screen.queryByText("优惠")).not.toBeInTheDocument()
        expect(rowText("实付款")).toContain("¥199.00")
    })
})
