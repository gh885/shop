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
import { useEffect } from "react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { useOrderActions } from "./use-order-actions"
import type { Order } from "./model"

import { createTestQueryClient, server } from "@shop/test-utils"

/**
 * useOrderActions 分发测试：pay 走导航、cancel 回调请求弹窗（弹窗归调用方）、
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

type Captured = ReturnType<typeof useOrderActions>
/** 探针：Probe 组件在路由上下文内把 hook 返回值抛出来供断言（对象属性变更，不违反 react/globals） */
const capturedBox: { current: Captured | null } = { current: null }
const cancelRequestBox: { current: Order | null } = { current: null }

function Probe() {
    const actions = useOrderActions((order) => {
        cancelRequestBox.current = order
    })
    useEffect(() => {
        capturedBox.current = actions
    }, [actions])
    const c = actions
    return (
        <div>
            <button onClick={() => c.handleAction(makeOrder({ id: "o-pay" }), "pay")}>pay</button>
            <button onClick={() => c.handleAction(makeOrder({ id: "o-cancel" }), "cancel")}>
                cancel
            </button>
            <button onClick={() => c.handleAction(makeOrder(), "confirm")}>confirm</button>
            <span data-testid="pending">{c.pendingAction ?? "none"}</span>
        </div>
    )
}

async function setup() {
    capturedBox.current = null
    cancelRequestBox.current = null
    const rootRoute = createRootRoute({ component: Probe })
    const payRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/pay/$orderId",
        component: () => <div>收银台页</div>,
    })
    const router = createRouter({
        routeTree: rootRoute.addChildren([payRoute]),
        history: createMemoryHistory({ initialEntries: ["/"] }),
    })
    const queryClient = createTestQueryClient()
    render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    )
    // router 异步挂载，等探针按钮出现再交互
    await screen.findByRole("button", { name: "pay" })
    return { user: userEvent.setup(), queryClient, router }
}

describe("useOrderActions", () => {
    it("pay 导航到收银台路由并携带订单 id", async () => {
        const { user, router } = await setup()

        await user.click(screen.getByRole("button", { name: "pay" }))

        await waitFor(() => expect(router.state.location.pathname).toBe("/pay/o-pay"))
    })

    it("cancel 只回调 onRequestCancel（弹窗由调用方持有），不发请求", async () => {
        const { user } = await setup()

        await user.click(screen.getByRole("button", { name: "cancel" }))

        expect(cancelRequestBox.current?.id).toBe("o-cancel")
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

    it("取消订单请求落到 wire 形状（PUT /orders/{id}/cancel），成功后失效订单列表缓存", async () => {
        let cancelBody: unknown
        server.use(
            http.put("*/orders/:id/cancel", async ({ request }) => {
                cancelBody = await request.json()
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { queryClient } = await setup()
        // 预置列表缓存，断言动作成功后被标记失效
        queryClient.setQueryData(["my-orders", "all", 1, 20], { records: [], total: 0 })

        // 用 hook 返回的 cancel.mutate 直接驱动（调用方从确认弹窗接线的就是它）
        await waitFor(() => expect(capturedBox.current).not.toBeNull())
        capturedBox.current!.cancel.mutate("o-1")

        await waitFor(() => expect(cancelBody).toMatchObject({ reason: "用户取消" }))
        await waitFor(() =>
            expect(queryClient.getQueryState(["my-orders", "all", 1, 20])?.isInvalidated).toBe(
                true,
            ),
        )
    })
})
