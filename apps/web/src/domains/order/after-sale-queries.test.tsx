import { useQuery } from "@tanstack/react-query"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { makeTicket, server } from "@shop/test-utils"

import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"

import { afterSaleOptions, useApplyAfterSale } from "./after-sale-queries"
import { myTradesOptions, orderKeys } from "./queries"

function RefundProbe({ orderId }: { orderId: string }) {
    const refund = useQuery(afterSaleOptions(orderId))
    const state = refund.isPending
        ? "loading"
        : refund.isError
          ? "error"
          : (refund.data?.status ?? "none")
    return <span data-testid="refund-state">{state}</span>
}

function ApplyProbe() {
    const apply = useApplyAfterSale("o-1")
    return (
        <button
            type="button"
            onClick={() =>
                apply.mutate({
                    type: "RETURN_REFUND",
                    reasonCode: "QUALITY_ISSUE",
                    reason: "  ",
                    lines: [{ orderItemId: "i-1", quantity: 1 }],
                })
            }
        >
            apply
        </button>
    )
}

describe("afterSaleOptions（退款单读取）", () => {
    it("从未申请过退款_404 归零为「没有」而不是错误", async () => {
        renderWithProviders(<RefundProbe orderId="o-1" />)

        await waitFor(() => expect(screen.getByTestId("refund-state").textContent).toBe("none"))
    })

    it("接口真失败_500 照实报错，不伪装成「没有退款」", async () => {
        server.use(
            http.get("*/orders/:id/refunds", () =>
                HttpResponse.json({ status: 500, detail: "服务器开小差了" }, { status: 500 }),
            ),
        )
        renderWithProviders(<RefundProbe orderId="o-1" />)

        await waitFor(() => expect(screen.getByTestId("refund-state").textContent).toBe("error"))
    })

    it("有退款单_状态透出（页面按它决定露哪些操作）", async () => {
        server.use(
            http.get("*/orders/:id/refunds", () =>
                HttpResponse.json(
                    makeTicket({
                        id: crypto.randomUUID(),
                        status: "RETURN_PENDING",
                        type: "RETURN_REFUND",
                    }),
                ),
            ),
        )
        renderWithProviders(<RefundProbe orderId="o-1" />)

        await waitFor(() =>
            expect(screen.getByTestId("refund-state").textContent).toBe("RETURN_PENDING"),
        )
    })
})

describe("useApplyAfterSale（申请后的一致性）", () => {
    it("申请成功_退款单 / 订单详情 / 主订单详情 / 订单列表四棵缓存同时失效", async () => {
        server.use(
            http.post("*/orders/:id/refunds", () =>
                HttpResponse.json(makeTicket({ id: crypto.randomUUID() }), { status: 201 }),
            ),
        )
        const queryClient = createAppTestQueryClient()
        const refundKey = afterSaleOptions("o-1").queryKey
        const detailKey = orderKeys.orderDetail("o-1")
        const tradeKey = orderKeys.tradeDetail("t-1")
        const listKey = myTradesOptions().queryKey
        queryClient.setQueryData(refundKey, null)
        queryClient.setQueryData(detailKey, { id: "o-1" })
        queryClient.setQueryData(tradeKey, { id: "t-1" })
        queryClient.setQueryData(listKey, { records: [], total: 0 })

        const user = userEvent.setup()
        renderWithProviders(<ApplyProbe />, { queryClient })
        await user.click(screen.getByRole("button", { name: "apply" }))

        await waitFor(() => expect(queryClient.getQueryState(refundKey)?.isInvalidated).toBe(true))
        expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(tradeKey)?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
    })
})
