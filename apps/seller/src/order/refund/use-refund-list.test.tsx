import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { afterSaleKeys, orderKeys } from "#/order/queries"
import { renderWithRouter } from "@shop/app-kit/test"

import { useRefundList } from "./use-refund-list"

/**
 * 工作台视图模型的接线测试：**两个 id 各归其位**。
 *
 * 列表行是售后单，处理端点却挂在订单资源下（/seller/orders/{orderId}/after-sales/agree）：
 * busy 态（哪一行在转圈）必须用售后单 id，请求路径必须用订单 id。
 * 这俩曾经串过位——表格按 ticket.id 判断禁用，而 run() 收到的是 orderId，
 * 结果按钮永远不禁用、连点两次就是两次退款决定。这类错不会有任何报错，只会静默失效。
 *
 * 另外钉住 URL 写回的两条：翻页要真的把页码写进去（apply 漏掉 next.page 时，翻页变成
 * 「点了没反应」），换页签要回到第 1 页（停在第 3 页看新页签是空列表，看着像「没有数据」）。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"
const TICKET_ID = "00000000-0000-4000-8000-0000000000bb"
const ORDER_ID = "00000000-0000-4000-8000-0000000000cc"

function Probe() {
    const list = useRefundList(SHOP_ID, { tab: "APPLYING", page: 1, size: 10 })
    return (
        <div>
            <button
                type="button"
                onClick={() => list.agreeAfterSale({ ticketId: TICKET_ID, orderId: ORDER_ID })}
            >
                agree
            </button>
            <button
                type="button"
                onClick={() => list.onPageChange(2)}
            >
                page-2
            </button>
            <button
                type="button"
                onClick={() => list.handleTabChange("RETURNING")}
            >
                tab-returning
            </button>
            <span data-testid="busy">{list.busyId ?? "none"}</span>
        </div>
    )
}

async function setup() {
    const { queryClient, router } = renderWithRouter(<Probe />, { initialEntry: "/trade/refund" })
    await screen.findByRole("button", { name: "agree" })
    return { user: userEvent.setup(), queryClient, router }
}

describe("useRefundList", () => {
    it("处理中_禁用态记在售后单 id 上，请求打到订单 id 上", async () => {
        let agreedOrderId: string | undefined
        let release: (() => void) | undefined
        server.use(
            http.put("*/seller/orders/:id/after-sales/agree", async ({ params }) => {
                agreedOrderId = String(params.id)
                await new Promise<void>((resolve) => {
                    release = resolve
                })
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await user.click(screen.getByRole("button", { name: "agree" }))

        // 表格按 ticket.id 判断该行禁用：busy 必须是售后单 id
        await waitFor(() => expect(screen.getByTestId("busy").textContent).toBe(TICKET_ID))
        // 请求路径用订单 id（端点挂在订单资源下）
        expect(agreedOrderId).toBe(ORDER_ID)

        release?.()
        await waitFor(() => expect(screen.getByTestId("busy").textContent).toBe("none"))
    })

    it("处理成功_工作台列表被重新拉取，售后单详情与订单列表一起失效", async () => {
        let listCalls = 0
        server.use(
            http.get("*/seller/after-sales", () => {
                listCalls += 1
                return HttpResponse.json({ records: [], total: 0 })
            }),
            http.put(
                "*/seller/orders/:id/after-sales/agree",
                () => new HttpResponse(null, { status: 204 }),
            ),
        )
        const { user, queryClient } = await setup()
        // 预置两棵"没有观察者"的缓存：售后单详情（决策弹窗读它）与订单列表（售后徽章来自投影列）。
        // 工作台列表自己有观察者，失效的表现是立刻重拉（见下面的 listCalls），不会留下 sticky 的失效标记。
        // key 由各域 options 工厂生成，不手抄字面量（形状一变，手抄的 key 会静默失配、断言落空）
        const ticketKey = afterSaleKeys.detail(SHOP_ID, ORDER_ID)
        const orderListKey = orderKeys.list(SHOP_ID, { page: 1, size: 10 })
        queryClient.setQueryData(ticketKey, null)
        queryClient.setQueryData(orderListKey, { records: [], total: 0 })
        const callsBefore = listCalls

        await user.click(screen.getByRole("button", { name: "agree" }))

        await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore))
        expect(queryClient.getQueryState(ticketKey)?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(orderListKey)?.isInvalidated).toBe(true)
    })
})

describe("useRefundList 的翻页与页签", () => {
    it("翻页把页码写进 URL：apply 漏掉 next.page 会让翻页整个不生效（点了没反应）", async () => {
        const { user, router } = await setup()

        await user.click(screen.getByRole("button", { name: "page-2" }))

        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({
                status: "APPLYING",
                page: 2,
                size: 10,
            }),
        )
    })

    it("换页签回到第 1 页：停在第 3 页看新页签是空列表，看着像「没有数据」", async () => {
        const { user, router } = await setup()

        await user.click(screen.getByRole("button", { name: "tab-returning" }))

        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({
                status: "RETURNING",
                page: 1,
                size: 10,
            }),
        )
    })
})
