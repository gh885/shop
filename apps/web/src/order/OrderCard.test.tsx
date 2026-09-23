import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { renderWithProviders } from "@shop/app-kit/test"
import type { Order, OrderAction } from "./model"
import { OrderCard } from "./OrderCard"

function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: "order-1",
        orderNo: "DEMO-BF8A-002",
        createdAt: "2026-09-17T12:00:00Z",
        status: "pending_shipment",
        payExpireAt: "",
        shipExpireAt: null,
        shopId: "shop-1",
        shopName: "演示服饰店",
        availableActions: ["cancel"],
        itemAmount: { amount: 20000, currency: "CNY" },
        payAmount: { amount: 18000, currency: "CNY" },
        items: ["跑步鞋 黑色 39", "连衣裙 碎花 S"].map((title, index) => ({
            productId: `product-${index}`,
            skuId: `sku-${index}`,
            title,
            price: { amount: 10000, currency: "CNY" },
            quantity: 1,
            amount: { amount: 10000, currency: "CNY" },
        })),
        ...overrides,
    }
}

describe("OrderCard 订单级操作", () => {
    it("多商品订单只显示一组操作，取消回调不携带商品或重复触发", async () => {
        const user = userEvent.setup()
        const onAction = vi.fn<(action: OrderAction) => void>()
        renderWithProviders(
            <OrderCard
                order={makeOrder()}
                onAction={onAction}
            />,
        )

        expect(screen.getAllByRole("button", { name: "取消订单" })).toHaveLength(1)
        await user.click(screen.getByRole("button", { name: "取消订单" }))
        expect(onAction).toHaveBeenCalledExactlyOnceWith("cancel")
    })

    it("待发货且已过发货时限_提示改成可取消退款，不写「系统会自动取消」", () => {
        renderWithProviders(
            <OrderCard order={makeOrder({ shipExpireAt: "2000-01-01T00:00:00Z" })} />,
        )

        expect(screen.getByText(/已超过发货时限/)).toBeInTheDocument()
        expect(screen.getByText(/可取消订单并退款/)).toBeInTheDocument()
        expect(screen.queryByText("等待商家发货，发货后可查看物流")).not.toBeInTheDocument()
    })

    it("待发货且未超时_给出商家该发货的时刻", () => {
        renderWithProviders(
            <OrderCard order={makeOrder({ shipExpireAt: "2099-01-01T00:00:00Z" })} />,
        )

        expect(screen.getByText(/^商家需在 .+ 前发货$/)).toBeInTheDocument()
    })

    it("展示优惠后的整单金额，不把商品小计之和当作应付金额", () => {
        renderWithProviders(<OrderCard order={makeOrder()} />)

        expect(screen.getByText("订单金额").parentElement).toHaveTextContent("¥180.00")
        expect(screen.getByText("跑步鞋 黑色 39")).toBeInTheDocument()
        expect(screen.getByText("连衣裙 碎花 S")).toBeInTheDocument()
        expect(screen.queryByText("规格：已选规格")).not.toBeInTheDocument()
    })

    it("件数按购买数量相加，商品合计来自行小计而不是列表的净额占位", () => {
        const order = makeOrder()
        order.items[0] = {
            ...order.items[0]!,
            quantity: 3,
            amount: { amount: 30000, currency: "CNY" },
        }
        renderWithProviders(<OrderCard order={{ ...order, itemAmount: order.payAmount }} />)

        expect(screen.getByText("共 4 件商品")).toBeInTheDocument()
        expect(screen.getByText("商品合计").parentElement).toHaveTextContent("¥400.00")
        expect(screen.getByText("购买数量：3 件")).toBeInTheDocument()
        expect(screen.getByText("等待商家发货，发货后可查看物流")).toBeInTheDocument()
    })

    it("已取消订单只说明关闭，不把未知的退款状态描述为退款成功", () => {
        renderWithProviders(
            <OrderCard order={makeOrder({ status: "cancelled", availableActions: [] })} />,
        )
        expect(screen.getByText("订单已关闭，取消及退款信息请查看详情")).toBeInTheDocument()
        expect(screen.queryByText("退款成功")).not.toBeInTheDocument()
    })

    it("进行中的订单操作禁用，详情入口仍可打开", async () => {
        const user = userEvent.setup()
        const onDetail = vi.fn<() => void>()
        renderWithProviders(
            <OrderCard
                order={makeOrder()}
                pendingAction="cancel"
                onDetail={onDetail}
            />,
        )

        expect(screen.getByRole("button", { name: "取消订单" })).toBeDisabled()
        await user.click(screen.getByRole("button", { name: "订单详情" }))
        expect(onDetail).toHaveBeenCalledOnce()
    })
})
