import { useQuery } from "@tanstack/react-query"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { makeTicket, server } from "@shop/test-utils"

import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"

import { afterSaleOptions, useApplyAfterSale } from "./after-sale-queries"
import { myOrdersOptions, ORDER_DETAIL_KEY } from "./queries"

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
        renderWithProviders(<TicketProbe orderId="o-1" />)

        await waitFor(() => expect(screen.getByTestId("ticket-state").textContent).toBe("none"))
    })

    it("接口真失败_500 照实报错，不伪装成「没有售后」", async () => {
        server.use(
            http.get("*/orders/:id/after-sales", () =>
                HttpResponse.json({ status: 500, detail: "服务器开小差了" }, { status: 500 }),
            ),
        )
        renderWithProviders(<TicketProbe orderId="o-1" />)

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
        renderWithProviders(<TicketProbe orderId="o-1" />)

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
        const ticketKey = afterSaleOptions("o-1").queryKey
        const detailKey = [...ORDER_DETAIL_KEY, "o-1"]
        const listKey = myOrdersOptions().queryKey
        queryClient.setQueryData(ticketKey, null)
        queryClient.setQueryData(detailKey, { id: "o-1" })
        queryClient.setQueryData(listKey, { records: [], total: 0 })

        const user = userEvent.setup()
        renderWithProviders(<ApplyProbe />, { queryClient })
        await user.click(screen.getByRole("button", { name: "apply" }))

        await waitFor(() => expect(queryClient.getQueryState(ticketKey)?.isInvalidated).toBe(true))
        expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
    })
})
