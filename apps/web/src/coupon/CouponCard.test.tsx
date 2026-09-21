import { QueryClientProvider } from "@tanstack/react-query"
import {
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { createAppTestQueryClient } from "#/test/render"

import { CouponCard } from "./CouponCard"
import type { MyCoupon } from "./coupon"

/**
 * 券卡片：只允许三行信息（面额 / 一句话规则 / 店名 + 有效期）+ 状态与来源标签，
 * 有订单关联时给一个回订单详情的链接。
 *
 * 卡片内含去 `/orders/$orderId` 的 Link，所以这里必须自带内存路由 ——
 * 共享的 renderWithProviders 不带路由上下文，而给全站测试壳塞一条订单路由是另一回事。
 */

const ORDER_ID = "00000000-0000-4000-8000-0000000000e1"

function makeCoupon(overrides: Partial<MyCoupon> = {}): MyCoupon {
    return {
        id: "00000000-0000-4000-8000-0000000000c1",
        shopId: "00000000-0000-4000-8000-0000000000a1",
        shopName: "测试店",
        name: "满100减10",
        threshold: { amount: 10000, currency: "CNY" },
        discount: { amount: 1000, currency: "CNY" },
        // 取正午的 UTC 时间：任何时区下 formatDate 都落在同一天，断言不随机器时区漂移
        effectiveAt: "2026-01-01T12:00:00Z",
        expireAt: "2026-01-31T12:00:00Z",
        status: "UNUSED",
        source: "CLAIM",
        unavailableReason: null,
        ...overrides,
    }
}

function renderCard(coupon: MyCoupon) {
    const rootRoute = createRootRoute({
        component: () => (
            <>
                <CouponCard coupon={coupon} />
                <Outlet />
            </>
        ),
    })
    const orderRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/orders/$orderId",
        component: () => <div>订单详情页</div>,
    })
    // 显式的首页子路由：不配它，内存路由落在 "/" 会走 notFound 分支，控制台一片告警
    const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => null,
    })
    const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, orderRoute]),
        history: createMemoryHistory({ initialEntries: ["/"] }),
    })
    render(
        <QueryClientProvider client={createAppTestQueryClient()}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    )
    return router
}

describe("CouponCard", () => {
    it("三行信息齐全_面额、一句话规则、店名与有效期", async () => {
        renderCard(makeCoupon())

        expect(await screen.findByText("¥10")).toBeVisible()
        expect(screen.getByText("满 ¥100 减 ¥10")).toBeVisible()
        expect(screen.getByText("测试店 · 2026-01-01 至 2026-01-31")).toBeVisible()
    })

    it("店名与有效期这一行被截断时可拿到全值_否则窄屏下用户永远看不到适用范围", async () => {
        renderCard(makeCoupon())

        // 截断是 CSS 行为，所以「能不能拿到全值」的证据是它落在一个可聚焦元素上（键盘也够得着），
        // 且该元素的可访问名就是完整文本（Tooltip 由它触发）
        expect(
            await screen.findByRole("button", { name: "测试店 · 2026-01-01 至 2026-01-31" }),
        ).toBeVisible()
    })

    it("无门槛券的规则文案是「无门槛减 ¥5」_不是「满 ¥0 减 ¥5」", async () => {
        renderCard(
            makeCoupon({
                threshold: { amount: 0, currency: "CNY" },
                discount: { amount: 500, currency: "CNY" },
            }),
        )

        expect(await screen.findByText("无门槛减 ¥5")).toBeVisible()
        expect(screen.getByText("¥5")).toBeVisible()
    })

    it("退款补发的券写明来源_券包里凭空多一张券必须能解释", async () => {
        renderCard(makeCoupon({ source: "REFUND_RETURN" }))

        expect(await screen.findByText("退款补发")).toBeVisible()
    })

    it("结算中（被未付款订单占用）的券显示状态「结算中」_不是含糊的「已锁定」", async () => {
        renderCard(makeCoupon({ status: "LOCKED" }))

        expect(await screen.findByText("结算中")).toBeVisible()
    })

    it("有订单关联的券给出回订单详情的链接_点进去是那一单", async () => {
        const user = userEvent.setup()
        renderCard(makeCoupon({ orderId: ORDER_ID }))

        const link = await screen.findByRole("link", { name: "查看订单" })
        expect(link).toHaveAttribute("href", `/orders/${ORDER_ID}`)

        await user.click(link)

        expect(await screen.findByText("订单详情页")).toBeVisible()
    })

    it("没关联订单的券不给订单链接_未用掉的券没有订单可看", async () => {
        renderCard(makeCoupon())

        await screen.findByText("满 ¥100 减 ¥10")
        expect(screen.queryByRole("link", { name: "查看订单" })).toBeNull()
    })

    it("领了但未开始的券给出灰字解释_状态徽章说未使用、这行说为什么现在还不能用", async () => {
        renderCard(makeCoupon({ unavailableReason: "NOT_EFFECTIVE" }))

        // 开抢时刻按时区渲染，断言只钉文案骨架不钉 HH（同文件对 formatDate 的时区处理同一思路）
        expect(await screen.findByText(/尚未开始，.* 起可用/)).toBeVisible()
    })

    it("结算中的券已过使用时间_如实补一行不能再用于新单", async () => {
        renderCard(makeCoupon({ status: "LOCKED", unavailableReason: "EXPIRED" }))

        expect(await screen.findByText("使用时间已过，本单之外不能再使用")).toBeVisible()
    })

    it("徽章已经解释清楚的行不重复挂时间灰字_EXPIRED与USED只看到状态本身", async () => {
        renderCard(makeCoupon({ status: "EXPIRED", unavailableReason: "EXPIRED" }))
        renderCard(makeCoupon({ status: "USED", unavailableReason: null }))

        await screen.findByText("已过期")
        expect(screen.queryByText(/使用时间已过/)).toBeNull()
        expect(screen.queryByText(/尚未开始/)).toBeNull()
    })
})
