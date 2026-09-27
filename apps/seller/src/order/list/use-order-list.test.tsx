import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vitest"

import type { SellerOrderListItemResponse } from "@shop/api/sdk"
import { makeSellerOrderListItem, server } from "@shop/test-utils"
import { renderWithRouter } from "@shop/app-kit/test"

import { OrderTable, type OrderIdentity } from "./table"
import { useOrderList } from "./use-order-list"
import type { RefundRowAction } from "#/order/refund/model"

/**
 * 买家电话这一列的接线：出参是掩码，「查看」逐单换明文。
 *
 * 关心三处会静默失效的地方：
 * ① 明文要就地写回列表缓存的那一行，而不是另存一份状态——存别处就会变成「点了没反应」；
 * ② 取明文这个动作**不能**失效列表查询。失效会立刻重拉一次，后端回的还是掩码，
 *    卖家刚点开的号码在眼前被抹回去，而这看起来只像「页面自己刷新了」；
 * ③ 索取中那一行的按钮必须禁用。一次索取 = 后端一条取用记录（ORD-62），连点两下不是
 *    「多看一眼」，是凭空多出两条审计记录。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"
const ORDER_ID = "00000000-0000-4000-8000-0000000000cc"
const MASKED = "138****1234"
const PLAIN = "13800001234"

function makeSellerOrder(
    overrides: Partial<SellerOrderListItemResponse> = {},
): SellerOrderListItemResponse {
    return makeSellerOrderListItem({
        id: ORDER_ID,
        payAmount: { amount: 2000, currency: "CNY" },
        receiverPhone: MASKED,
        ...overrides,
    })
}

/** 返回这一屏被拉了几次（点「查看」之后必须还是 1）+ 索取被发了几次 */
function useOrderRoutes(revealDelayMs = 0) {
    const calls = {
        list: 0,
        reveal: 0,
        revealedOn: undefined as string | undefined,
    }
    server.use(
        http.get("*/seller/orders", () => {
            calls.list += 1
            return HttpResponse.json({ records: [makeSellerOrder()], total: 1 })
        }),
        http.get("*/seller/after-sales/actions", () => HttpResponse.json([])),
        http.post("*/seller/orders/:id/receiver-phone", async ({ params }) => {
            calls.reveal += 1
            calls.revealedOn = String(params.id)
            if (revealDelayMs) await delay(revealDelayMs)
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
            revealingId={list.revealPhoneFor}
        />
    )
}

async function setup() {
    renderWithRouter(<Probe />, { initialEntry: "/trade/order" })
    return { user: userEvent.setup() }
}

describe("订单列表的买家电话", () => {
    it("默认只有掩码，且给一个说得出是谁的查看入口", async () => {
        useOrderRoutes()
        await setup()

        expect(await screen.findByText(MASKED)).toBeInTheDocument()
        // 一屏十行都是「查看」时，读屏必须能分辨这个按钮换的是哪一单
        expect(screen.getByRole("button", { name: "查看张三的号码" })).toBeInTheDocument()
    })

    it("点查看_请求打在这一单上，号码就地换明文且入口消失", async () => {
        const calls = useOrderRoutes()
        const { user } = await setup()
        await user.click(await screen.findByRole("button", { name: "查看张三的号码" }))

        await waitFor(() => expect(screen.getByText(PLAIN)).toBeInTheDocument())
        expect(calls.revealedOn).toBe(ORDER_ID)
        expect(screen.queryByRole("button", { name: /查看/ })).not.toBeInTheDocument()
        // 换明文不重拉列表：重拉等于刚点开就抹回去
        expect(calls.list).toBe(1)
    })

    it("索取没回来前连点_只发一次请求：一次索取是一条取用留痕，不是多看一眼", async () => {
        const calls = useOrderRoutes(50)
        const { user } = await setup()
        const reveal = await screen.findByRole("button", { name: "查看张三的号码" })

        await user.click(reveal)
        expect(reveal).toBeDisabled()
        await user.click(reveal)

        await waitFor(() => expect(screen.getByText(PLAIN)).toBeInTheDocument())
        expect(calls.reveal).toBe(1)
    })
})
