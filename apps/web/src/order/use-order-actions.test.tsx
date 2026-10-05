import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { renderWithRouter } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import { useOrderActions } from "./use-order-actions"
import type { Order } from "./model"
import { myOrdersOptions } from "./queries"

/**
 * useOrderActions 分发测试：pay 走导航、cancel 起取消原因弹窗（选原因/填备注后确认才发请求，
 * 快捷原因与备注拼成自由文本透传；什么都不选则 reason 缺席）、
 * confirm 发确认收货请求、extend_receive 走全局二次确认（点确认才发请求，取消则一发不出），
 * pendingAction 防重复提交。
 * 导航用 MemoryRouter 断言地址；网络层用 MSW 局部覆盖并捕获请求，不 mock 内部模块。
 */

/** 测试夹具：领域形状 Order 的最小构造（handleAction 只读 id/orderNo，其余字段求合法） */
function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: "o-1",
        orderNo: "NO20260906001",
        createdAt: "2026-09-06T11:30:00Z",
        status: "pending_receipt",
        payExpireAt: "2026-09-06T12:00:00Z",
        shipExpireAt: null,
        shopId: "shop-1",
        shopName: "测试店",
        items: [],
        availableActions: [],
        itemAmount: { amount: 19900, currency: "CNY" },
        payAmount: { amount: 19900, currency: "CNY" },
        ...overrides,
    }
}

/** 探针：Probe 组件在路由上下文内渲染四个动作按钮 + 取消弹窗，pending 态读 data-testid */
function Probe() {
    const { handleAction, pendingAction, cancelDialog } = useOrderActions()
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
            <button
                type="button"
                onClick={() => handleAction(makeOrder(), "extend_receive")}
            >
                extend
            </button>
            <span data-testid="pending">{pendingAction ?? "none"}</span>
            {cancelDialog}
        </div>
    )
}

async function setup() {
    // 取消弹窗 / 延长收货二次确认的文案走本端 catalog，需传 web 的 resources
    const { queryClient, router } = renderWithRouter(<Probe />, { resources: webMessages })
    // router 异步挂载，等探针按钮出现再交互
    await screen.findByRole("button", { name: "pay" })
    return { user: userEvent.setup(), queryClient, router }
}

/** 点 cancel 打开取消弹窗（等弹窗文案出现），返回 user 便于继续交互 */
async function openCancel(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "cancel" }))
    await screen.findByText(/该操作不可恢复/)
}

/** 弹窗里的「确认取消」按钮 */
function confirmButton() {
    return screen.getByRole("button", { name: "确认取消" })
}

/** 点 extend 打开延长收货的二次确认（等确认面标题出现） */
async function openExtendConfirm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "extend" }))
    await screen.findByText(/延长确认收货/)
}

describe("useOrderActions", () => {
    it("pay 导航到收银台路由并携带订单 id", async () => {
        const { user, router } = await setup()

        await user.click(screen.getByRole("button", { name: "pay" }))

        await waitFor(() => expect(router.state.location.pathname).toBe("/pay/o-pay"))
    })

    it("cancel 起取消原因弹窗，点「再想想」关闭且不发请求", async () => {
        let requested = false
        server.use(
            http.put("*/orders/:id/cancel", () => {
                requested = true
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await openCancel(user)
        await user.click(screen.getByRole("button", { name: "再想想" }))

        await waitFor(() => expect(screen.queryByText(/该操作不可恢复/)).toBeNull())
        expect(requested).toBe(false)
    })

    it("cancel 选原因 + 填备注后确认，拼成自由文本透传 PUT /orders/{id}/cancel，成功后失效列表缓存并关闭弹窗", async () => {
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

        await openCancel(user)
        await user.click(await screen.findByRole("radio", { name: "不想买了" }))
        await user.type(screen.getByPlaceholderText("想对卖家说的话（选填）"), "临时用不到了")
        await user.click(confirmButton())

        await waitFor(() => expect(cancelBody).toMatchObject({ reason: "不想买了：临时用不到了" }))
        await waitFor(() => expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true))
        await waitFor(() => expect(screen.queryByText(/该操作不可恢复/)).toBeNull())
    })

    it("cancel 不选原因不填备注时 reason 缺席，不硬造占位文案", async () => {
        let cancelBody: unknown
        server.use(
            http.put("*/orders/:id/cancel", async ({ request }) => {
                cancelBody = await request.json()
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await openCancel(user)
        await user.click(confirmButton())

        await waitFor(() => expect(cancelBody).toBeDefined())
        expect(cancelBody).not.toHaveProperty("reason")
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

        await openCancel(user)
        await user.click(screen.getByRole("radio", { name: "信息填错" }))
        await user.click(confirmButton())

        await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("cancel"))

        release?.()
        await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("none"))
    })

    it("confirm 直接发起确认收货请求（PUT /orders/{id}/receive），无需弹窗", async () => {
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

    it("extend_receive 起二次确认，点「延长 7 天」才发 PUT /orders/{id}/receive/extend", async () => {
        let extendedOrderId: string | undefined
        server.use(
            http.put("*/orders/:id/receive/extend", ({ params }) => {
                extendedOrderId = typeof params.id === "string" ? params.id : undefined
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await openExtendConfirm(user)
        expect(extendedOrderId, "额度只有一次，光点开不该发请求").toBeUndefined()

        await user.click(screen.getByRole("button", { name: "延长 7 天" }))

        await waitFor(() => expect(extendedOrderId).toBe("o-1"))
        await waitFor(() => expect(screen.queryByText(/延长确认收货/)).toBeNull())
    })

    it("extend_receive 二次确认点「取消」不发请求，买家点错还能反悔", async () => {
        let requested = false
        server.use(
            http.put("*/orders/:id/receive/extend", () => {
                requested = true
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await openExtendConfirm(user)
        await user.click(screen.getByRole("button", { name: "取消" }))

        await waitFor(() => expect(screen.queryByText(/延长确认收货/)).toBeNull())
        expect(requested).toBe(false)
    })

    it("extend 请求进行中 pendingAction 是 extend_receive，完成后回到 none", async () => {
        let release: (() => void) | undefined
        server.use(
            http.put("*/orders/:id/receive/extend", async () => {
                await new Promise<void>((resolve) => {
                    release = resolve
                })
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await openExtendConfirm(user)
        await user.click(screen.getByRole("button", { name: "延长 7 天" }))

        await waitFor(() =>
            expect(screen.getByTestId("pending").textContent).toBe("extend_receive"),
        )

        release?.()
        await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("none"))
    })
})
