import { QueryClientProvider } from "@tanstack/react-query"
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { ConfirmDialogHost } from "@shop/ui-web"
import { server } from "@shop/test-utils"

import { createAppTestQueryClient } from "#/test/render"

import { useOrderActions } from "./use-order-actions"
import type { Order } from "./model"
import { myOrdersOptions } from "./queries"

/**
 * useOrderActions 分发测试：pay 走导航、cancel 起全局二次确认（确认后才发取消请求）、
 * confirm 发确认收货请求、pendingAction 防重复提交。
 * 导航用 MemoryRouter 断言地址；网络层用 MSW 局部覆盖并捕获请求，不 mock 内部模块。
 */

/** 测试夹具：领域形状 Order 的最小构造（handleAction 只读 id，其余字段求合法） */
function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: "o-1",
        orderNo: "NO20260906001",
        createdAt: "2026-09-06T11:30:00Z",
        status: "pending_receipt",
        payExpireAt: "2026-09-06T12:00:00Z",
        shopId: "shop-1",
        shopName: "测试店",
        items: [],
        availableActions: [],
        itemAmount: { amount: 19900, currency: "CNY" },
        payAmount: { amount: 19900, currency: "CNY" },
        ...overrides,
    }
}

/** 探针：Probe 组件在路由上下文内渲染三个动作按钮，pending 态读 data-testid */
function Probe() {
    const { handleAction, pendingAction } = useOrderActions()
    return (
        <div>
            <button
                type="button"
                onClick={() => handleAction(makeOrder({ id: "o-pay" }), "pay")}
            >
                pay
            </button>
            <button
                type="button"
                onClick={() => handleAction(makeOrder({ id: "o-cancel" }), "cancel")}
            >
                cancel
            </button>
            <button
                type="button"
                onClick={() => handleAction(makeOrder(), "confirm")}
            >
                confirm
            </button>
            <span data-testid="pending">{pendingAction ?? "none"}</span>
        </div>
    )
}

async function setup() {
    const rootRoute = createRootRoute({
        component: () => (
            <>
                <Probe />
                <ConfirmDialogHost />
            </>
        ),
    })
    const payRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/pay/$orderId",
        component: () => <div>收银台页</div>,
    })
    const router = createRouter({
        routeTree: rootRoute.addChildren([payRoute]),
        history: createMemoryHistory({ initialEntries: ["/"] }),
    })
    const queryClient = createAppTestQueryClient()
    render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    )
    // router 异步挂载，等探针按钮出现再交互
    await screen.findByRole("button", { name: "pay" })
    return { user: userEvent.setup(), queryClient, router }
}

/** 取消确认弹窗里的「取消订单」按钮（标题同名，按 role 区分） */
async function findConfirmButton() {
    await screen.findByText("确定取消订单 NO20260906001 吗？该操作不可恢复。")
    return screen.findByRole("button", { name: "取消订单" })
}

describe("useOrderActions", () => {
    it("pay 导航到收银台路由并携带订单 id", async () => {
        const { user, router } = await setup()

        await user.click(screen.getByRole("button", { name: "pay" }))

        await waitFor(() => expect(router.state.location.pathname).toBe("/pay/o-pay"))
    })

    it("cancel 起二次确认，点「取消」不发请求", async () => {
        let requested = false
        server.use(
            http.put("*/orders/:id/cancel", () => {
                requested = true
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await user.click(screen.getByRole("button", { name: "cancel" }))
        await findConfirmButton()
        await user.click(screen.getByRole("button", { name: "取消" }))

        await waitFor(() => expect(screen.queryByText("取消订单")).toBeNull())
        expect(requested).toBe(false)
    })

    it("cancel 在确认弹窗点确认后发取消请求（PUT /orders/{id}/cancel），成功后失效订单列表缓存", async () => {
        let cancelBody: unknown
        server.use(
            http.put("*/orders/:id/cancel", async ({ request }) => {
                cancelBody = await request.json()
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user, queryClient } = await setup()
        // 预置列表缓存，断言动作成功后被标记失效（key 由域内 options 工厂生成，不手抄字面量）
        const listKey = myOrdersOptions().queryKey
        queryClient.setQueryData(listKey, { records: [], total: 0 })

        await user.click(screen.getByRole("button", { name: "cancel" }))
        await user.click(await findConfirmButton())

        await waitFor(() => expect(cancelBody).toMatchObject({ reason: "用户取消" }))
        await waitFor(() => expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true))
        // 成功后确认面关闭
        await waitFor(() => expect(screen.queryByText("取消订单")).toBeNull())
    })

    it("请求进行中 pendingAction 是 cancel，完成后回到 none", async () => {
        let release: (() => void) | undefined
        server.use(
            http.put("*/orders/:id/cancel", async () => {
                await new Promise<void>((resolve) => {
                    release = resolve
                })
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await user.click(screen.getByRole("button", { name: "cancel" }))
        await user.click(await findConfirmButton())

        await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("cancel"))

        release?.()
        await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("none"))
    })

    it("confirm 发起确认收货请求（PUT /orders/{id}/receive）", async () => {
        let receivedOrderId: string | undefined
        server.use(
            http.put("*/orders/:id/receive", ({ params }) => {
                receivedOrderId = typeof params.id === "string" ? params.id : undefined
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await user.click(screen.getByRole("button", { name: "confirm" }))

        await waitFor(() => expect(receivedOrderId).toBe("o-1"))
    })

    it("请求进行中 pendingAction 是 confirm，完成后回到 none", async () => {
        let release: (() => void) | undefined
        server.use(
            http.put("*/orders/:id/receive", async () => {
                await new Promise<void>((resolve) => {
                    release = resolve
                })
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await user.click(screen.getByRole("button", { name: "confirm" }))

        await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("confirm"))

        release?.()
        await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("none"))
    })
})
