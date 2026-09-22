import { QueryClientProvider, useQuery } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"

import { makeTicket, server } from "@shop/test-utils"

import { createAppTestQueryClient } from "@shop/app-kit/test"

import { afterSaleOptions, useApplyAfterSale } from "./after-sale-queries"
import { myOrdersOptions, ORDER_DETAIL_KEY } from "./queries"

/**
 * 售后数据层测试：两件必须钉住的事——
 * 1. 「从没申请过售后」的 404 不是错误（页面据此决定售后卡画不画），而真故障不能被吞成「没有」；
 * 2. 写操作要同时失效售后单 / 订单详情 / 订单列表三棵树：订单上的 afterSaleStatus 是投影列，
 *    少失效一棵就会出现「售后卡已更新、订单徽章还是旧值」这种自相矛盾的界面。
 */

/** 探针：把 query 状态压成一个可断言的文本 */
function TicketProbe({ orderId }: { orderId: string }) {
    const ticket = useQuery(afterSaleOptions(orderId))
    const state = ticket.isPending
        ? "loading"
        : ticket.isError
          ? "error"
          : (ticket.data?.status ?? "none")
    return <span data-testid="ticket-state">{state}</span>
}

function ApplyProbe() {
    const apply = useApplyAfterSale("o-1")
    return (
        <button
            type="button"
            onClick={() =>
                apply.mutate({
                    type: "REFUND_ONLY",
                    reasonCode: "QUALITY_ISSUE",
                    reason: "  ",
                })
            }
        >
            apply
        </button>
    )
}

describe("afterSaleOptions（售后单读取）", () => {
    it("从未申请过售后_404 归零为「没有」而不是错误", async () => {
        render(
            <QueryClientProvider client={createAppTestQueryClient()}>
                <TicketProbe orderId="o-1" />
            </QueryClientProvider>,
        )

        await waitFor(() => expect(screen.getByTestId("ticket-state").textContent).toBe("none"))
    })

    it("接口真失败_500 照实报错，不伪装成「没有售后」", async () => {
        server.use(
            http.get("*/orders/:id/after-sales", () =>
                HttpResponse.json({ status: 500, detail: "服务器开小差了" }, { status: 500 }),
            ),
        )
        render(
            <QueryClientProvider client={createAppTestQueryClient()}>
                <TicketProbe orderId="o-1" />
            </QueryClientProvider>,
        )

        await waitFor(() => expect(screen.getByTestId("ticket-state").textContent).toBe("error"))
    })

    it("有售后单_状态透出（页面按它决定露哪些操作）", async () => {
        server.use(
            http.get("*/orders/:id/after-sales", () =>
                HttpResponse.json(
                    makeTicket({
                        id: crypto.randomUUID(),
                        status: "RETURNING",
                        type: "RETURN_REFUND",
                    }),
                ),
            ),
        )
        render(
            <QueryClientProvider client={createAppTestQueryClient()}>
                <TicketProbe orderId="o-1" />
            </QueryClientProvider>,
        )

        await waitFor(() =>
            expect(screen.getByTestId("ticket-state").textContent).toBe("RETURNING"),
        )
    })
})

describe("useApplyAfterSale（申请后的一致性）", () => {
    it("申请成功_售后单 / 订单详情 / 订单列表三棵缓存同时失效", async () => {
        server.use(
            http.post("*/orders/:id/after-sales", () =>
                HttpResponse.json(makeTicket({ id: crypto.randomUUID() }), { status: 201 }),
            ),
        )
        const queryClient = createAppTestQueryClient()
        // 预置三棵缓存：售后单、订单详情（afterSaleStatus 投影在这）、订单列表。
        // key 一律由各域 options 工厂生成 —— 手抄字面量会在 key 形状变化时静默失配（测试照过、断言落空）
        const ticketKey = afterSaleOptions("o-1").queryKey
        // 详情这棵的 key 由导出的前缀常量拼（不算工厂）：本用例只断言它被标脏，
        // 值不参与任何渲染，用前缀常量即可避免为了类型正确造一整份 OrderDetail
        const detailKey = [...ORDER_DETAIL_KEY, "o-1"]
        const listKey = myOrdersOptions().queryKey
        queryClient.setQueryData(ticketKey, null)
        queryClient.setQueryData(detailKey, { id: "o-1" })
        queryClient.setQueryData(listKey, { records: [], total: 0 })

        const user = userEvent.setup()
        render(
            <QueryClientProvider client={queryClient}>
                <ApplyProbe />
            </QueryClientProvider>,
        )
        await user.click(screen.getByRole("button", { name: "apply" }))

        await waitFor(() => expect(queryClient.getQueryState(ticketKey)?.isInvalidated).toBe(true))
        expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
    })
})
