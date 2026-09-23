import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vitest"

import type { SellerOrderListItemResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"
import { QueryClientProvider } from "@tanstack/react-query"
import { createAppTestQueryClient } from "@shop/app-kit/test"

import { OrderTable, type OrderIdentity } from "./table"
import { useOrderList } from "./use-order-list"
import type { RefundRowAction } from "#/order/refund/model"

/**
 * 买家电话这一列的接线：出参是掩码，「查看」逐单换明文。
 *
 * 关心两处会静默失效的地方：
 * ① 明文要就地写回列表缓存的那一行，而不是另存一份状态——存别处就会变成「点了没反应」；
 * ② 取明文这个动作**不能**失效列表查询。失效会立刻重拉一次，后端回的还是掩码，
 *    卖家刚点开的号码在眼前被抹回去，而这看起来只像「页面自己刷新了」。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"
const ORDER_ID = "00000000-0000-4000-8000-0000000000cc"
const MASKED = "138****1234"
const PLAIN = "13800001234"

function makeSellerOrder(
    overrides: Partial<SellerOrderListItemResponse> = {},
): SellerOrderListItemResponse {
    return {
        id: ORDER_ID,
        orderNo: "2026092300001",
        status: "PAID",
        afterSaleStatus: "NONE",
        availableActions: ["SHIP"],
        payAmount: { amount: 2000, currency: "CNY" },
        receiverName: "张三",
        receiverPhone: MASKED,
        itemCount: 1,
        items: [],
        shipExpireAt: null,
        createdAt: "2026-09-23T10:00:00Z",
        ...overrides,
    }
}

/** 返回这一屏被拉了几次：点「查看」之后必须还是 1 */
function useOrderRoutes() {
    const calls = { list: 0, revealedOn: undefined as string | undefined }
    server.use(
        http.get("*/seller/orders", () => {
            calls.list += 1
            return HttpResponse.json({ records: [makeSellerOrder()], total: 1 })
        }),
        http.get("*/seller/after-sales/actions", () => HttpResponse.json([])),
        http.post("*/seller/orders/:id/receiver-phone", ({ params }) => {
            calls.revealedOn = String(params.id)
            return HttpResponse.json({ phone: PLAIN })
        }),
    )
    return calls
}

function Probe() {
    const list = useOrderList(SHOP_ID, { page: 1, size: 10 })
    return (
        <OrderTable
            rows={list.records}
            page={1}
            pageSize={10}
            total={list.total}
            onPageChange={vi.fn<(page: number) => void>()}
            onShip={vi.fn<(order: OrderIdentity) => void>()}
            afterSaleActionsOf={() => []}
            onAfterSaleAction={vi.fn<(order: OrderIdentity, action: RefundRowAction) => void>()}
            onRevealPhone={(o) => list.revealPhone(o.id)}
        />
    )
}

async function setup() {
    const rootRoute = createRootRoute({ component: Probe })
    const orderRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/trade/order",
        component: () => <div>订单</div>,
    })
    const router = createRouter({
        routeTree: rootRoute.addChildren([orderRoute]),
        history: createMemoryHistory({ initialEntries: ["/trade/order"] }),
    })
    const queryClient = createAppTestQueryClient()
    render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    )
    return { user: userEvent.setup() }
}

describe("订单列表的买家电话", () => {
    it("默认只有掩码，且给一个查看入口", async () => {
        useOrderRoutes()
        await setup()

        expect(await screen.findByText(MASKED)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "查看" })).toBeInTheDocument()
    })

    it("点查看_请求打在这一单上，号码就地换明文且入口消失", async () => {
        const calls = useOrderRoutes()
        const { user } = await setup()
        await user.click(await screen.findByRole("button", { name: "查看" }))

        await waitFor(() => expect(screen.getByText(PLAIN)).toBeInTheDocument())
        expect(calls.revealedOn).toBe(ORDER_ID)
        expect(screen.queryByRole("button", { name: "查看" })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "查看" })).not.toBeInTheDocument()
        // 换明文不重拉列表：重拉等于刚点开就抹回去
        expect(calls.list).toBe(1)
    })
})
