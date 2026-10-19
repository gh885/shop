import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { makeTicket, server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import { AfterSaleApplyDialog } from "./AfterSaleApplyDialog"
import type { OrderItem } from "./rules"

type Captured = { orderId: string; body: unknown }

/** 两行：A 已发出 2 件（退回路径可退 2），B 未发出 1 件（仅退款可退 1） */
const ITEMS: OrderItem[] = [
    {
        orderItemId: "a",
        productId: "p-1",
        skuId: "s-1",
        title: "测试商品",
        price: { amount: 1000, currency: "CNY" },
        quantity: 2,
        shippedQuantity: 2,
        refundedQuantity: 0,
        amount: { amount: 2000, currency: "CNY" },
    },
    {
        orderItemId: "b",
        productId: "p-2",
        skuId: "s-2",
        title: "未发货商品",
        price: { amount: 500, currency: "CNY" },
        quantity: 1,
        shippedQuantity: 0,
        refundedQuantity: 0,
        amount: { amount: 500, currency: "CNY" },
    },
]

function useCaptureApply(captured: Captured[]) {
    server.use(
        http.post("*/orders/:id/refunds", async ({ request, params }) => {
            captured.push({
                orderId: String(params.id),
                body: await request.json(),
            })
            return HttpResponse.json(makeTicket({ id: crypto.randomUUID() }), { status: 201 })
        }),
    )
}

function renderDialog(onOpenChange = vi.fn<(open: boolean) => void>()) {
    renderWithProviders(
        <AfterSaleApplyDialog
            open
            onOpenChange={onOpenChange}
            orderId="o-1"
            orderNo="NO20260906001"
            items={ITEMS}
        />,
        { resources: webMessages },
    )
    return onOpenChange
}

/** 选售后原因：Base UI 的下拉是「触发器 + Portal 里的 listbox」，两步点出来 */
async function pickReason(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: label }))
}

describe("AfterSaleApplyDialog", () => {
    it("没选售后原因_提交被校验拦下：一条请求都不发", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureApply(captured)

        renderDialog()
        await user.click(screen.getByRole("button", { name: "提交申请" }))

        await waitFor(() => expect(screen.getByText("请选择售后原因")).toBeInTheDocument())
        expect(captured).toHaveLength(0)
    })

    it("默认退货退款_数量默认填满可退额度，提交只带 > 0 的行", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureApply(captured)

        renderDialog()
        await pickReason(user, "质量问题")
        await user.click(screen.getByRole("button", { name: "提交申请" }))

        await waitFor(() => expect(captured).toHaveLength(1))
        expect(captured[0]).toEqual({
            orderId: "o-1",
            body: {
                type: "RETURN_REFUND",
                reasonCode: "QUALITY_ISSUE",
                lines: [{ orderItemId: "a", quantity: 2 }],
            },
        })
    })

    it("仅退款_只退未发出商品：额度按类型切换，未发的那行默认 1 件", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureApply(captured)

        renderDialog()
        await user.click(screen.getByRole("radio", { name: "仅退款" }))
        await pickReason(user, "质量问题")
        // 已发出的商品仅退款额度为 0：数量框禁用、默认不出现
        await waitFor(() => expect(screen.getByLabelText("测试商品 退款数量")).toBeDisabled())
        await user.click(screen.getByRole("button", { name: "提交申请" }))

        await waitFor(() => expect(captured).toHaveLength(1))
        expect(captured[0]).toEqual({
            orderId: "o-1",
            body: {
                type: "REFUND_ONLY",
                reasonCode: "QUALITY_ISSUE",
                lines: [{ orderItemId: "b", quantity: 1 }],
            },
        })
    })

    it("退货退款与七天无理由并填补充说明_按 wire 形状提交并关闭弹窗", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureApply(captured)

        const onOpenChange = renderDialog()

        await pickReason(user, "七天无理由退货")
        await user.type(screen.getByLabelText("补充说明"), "尺码偏小，想寄回换大一号")
        await user.click(screen.getByRole("button", { name: "提交申请" }))

        await waitFor(() => expect(captured).toHaveLength(1))
        expect(captured[0]).toEqual({
            orderId: "o-1",
            body: {
                type: "RETURN_REFUND",
                reasonCode: "NO_REASON",
                reason: "尺码偏小，想寄回换大一号",
                lines: [{ orderItemId: "a", quantity: 2 }],
            },
        })
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("提交被拒（409 该行已有进行中的退款）_弹窗不关闭：不能装作提交成功", async () => {
        const user = userEvent.setup()
        server.use(
            http.post("*/orders/:id/refunds", () =>
                HttpResponse.json(
                    { status: 409, detail: "该订单行已有进行中的退款" },
                    { status: 409 },
                ),
            ),
        )

        const onOpenChange = renderDialog()
        await pickReason(user, "质量问题")
        await user.click(screen.getByRole("button", { name: "提交申请" }))

        await waitFor(() => expect(onOpenChange).not.toHaveBeenCalledWith(false))
        expect(screen.getByRole("button", { name: "提交申请" })).toBeEnabled()
    })
})
