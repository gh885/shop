import type { OrderDetailResponse } from "@shop/api/sdk"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderWithProviders } from "#/test/render"

import type { OrderDetail } from "./model"
import { toOrderDetail } from "./order"
import { OrderSummaryCard } from "./OrderSummaryCard"

/**
 * 付款详情测试：三行金额必须自洽（商品总价 + 运费 − 优惠 = 实付款）。
 *
 * 有券订单以前会把「净额」当成「商品总价」画出来，于是加了券以后付款详情看起来无解；
 * 这里断言的是买家能看见的数与负号，不是组件的渲染次数。
 */

const MONEY = { amount: 19900, currency: "CNY" }

function makeOrderDetail(overrides: Partial<OrderDetailResponse> = {}): OrderDetail {
    return toOrderDetail({
        id: "o-1",
        orderNo: "NO20260906001",
        status: "PAID",
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
        completedAt: null,
        cancelledAt: null,
        cancelReason: null,
        createdAt: "2026-09-06T11:30:00Z",
        afterSaleStatus: "NONE",
        refundAmount: null,
        applyExpireAt: null,
        items: [
            {
                productId: "p-1",
                skuId: "sku-1",
                name: "测试商品",
                image: null,
                price: { amount: 20000, currency: "CNY" },
                originalPrice: null,
                quantity: 1,
                amount: { amount: 20000, currency: "CNY" },
            },
        ],
        ...overrides,
    })
}

/** 读一行「label … 金额」的整行文本：Price 把金额拆成多个 span，只能看整行 */
function rowText(label: string): string {
    return screen.getByText(label).closest("div")?.textContent ?? ""
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
