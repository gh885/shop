import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { afterSaleKeys, orderKeys } from "#/order/queries"
import { renderWithRouter } from "@shop/app-kit/test"

import { useRefundList } from "./use-refund-list"

// 列表行是退款单、处理端点挂订单资源：busy 用 refund.id、请求用 orderId；串了位按钮永远不禁用，连点两次就是两次退款决定

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"
const REFUND_ID = "00000000-0000-4000-8000-0000000000bb"
const ORDER_ID = "00000000-0000-4000-8000-0000000000cc"

function Probe() {
    const list = useRefundList(SHOP_ID, { tab: "PENDING", page: 1, size: 10 })
    return (
        <div>
            <button
                type="button"
                onClick={() => list.agreeRefund({ refundId: REFUND_ID, orderId: ORDER_ID })}
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
                onClick={() => list.handleTabChange("RETURN_PENDING")}
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
    it("处理中_禁用态记在退款单 id 上，请求打到订单 id 上", async () => {
        let agreedOrderId: string | undefined
        let release: (() => void) | undefined
        server.use(
            http.put("*/seller/orders/:id/refunds/agree", async ({ params }) => {
                agreedOrderId = String(params.id)
                await new Promise<void>((resolve) => {
                    release = resolve
                })
                return new HttpResponse(null, { status: 204 })
            }),
        )
        const { user } = await setup()

        await user.click(screen.getByRole("button", { name: "agree" }))

        await waitFor(() => expect(screen.getByTestId("busy").textContent).toBe(REFUND_ID))
        expect(agreedOrderId).toBe(ORDER_ID)

        release?.()
        await waitFor(() => expect(screen.getByTestId("busy").textContent).toBe("none"))
    })

    it("处理成功_工作台列表被重新拉取，退款单详情与订单列表一起失效", async () => {
        let listCalls = 0
        server.use(
            http.get("*/seller/refunds", () => {
                listCalls += 1
                return HttpResponse.json({ records: [], total: 0 })
            }),
            http.put(
                "*/seller/orders/:id/refunds/agree",
                () => new HttpResponse(null, { status: 204 }),
            ),
        )
        const { user, queryClient } = await setup()
        const refundKey = afterSaleKeys.detail(SHOP_ID, ORDER_ID)
        const orderListKey = orderKeys.list(SHOP_ID, { page: 1, size: 10 })
        queryClient.setQueryData(refundKey, null)
        queryClient.setQueryData(orderListKey, { records: [], total: 0 })
        const callsBefore = listCalls

        await user.click(screen.getByRole("button", { name: "agree" }))

        await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore))
        expect(queryClient.getQueryState(refundKey)?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(orderListKey)?.isInvalidated).toBe(true)
    })
})

describe("useRefundList 的翻页与页签", () => {
    it("翻页把页码写进 URL：apply 漏掉 next.page 会让翻页整个不生效（点了没反应）", async () => {
        const { user, router } = await setup()

        await user.click(screen.getByRole("button", { name: "page-2" }))

        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({
                status: "PENDING",
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
                status: "RETURN_PENDING",
                page: 1,
                size: 10,
            }),
        )
    })
})
