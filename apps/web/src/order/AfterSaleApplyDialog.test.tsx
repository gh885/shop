import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vitest"

import { makeTicket, server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { AfterSaleApplyDialog } from "./AfterSaleApplyDialog"

/**
 * 申请售后弹窗集成测试：真实 TanStack Form + React Query + MSW，只 mock HTTP。
 *
 * 关心的是「买家填的东西 → wire 请求体」这段投影：空白补充说明不能以空串落库，
 * 类型必须原样带上（后端按 type 分派仅退款 / 退货退款两条完全不同的路），
 * 而原因必选——它是后端判定「七天无理由不可拒绝受理」的唯一依据，没选就连请求都不该发出去。
 */

type Captured = { orderId: string; body: unknown }

function useCaptureApply(captured: Captured[]) {
    server.use(
        http.post("*/orders/:id/after-sales", async ({ request, params }) => {
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
        />,
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

    it("仅退款 + 选原因、补充说明留空_提交不带空 reason（空白不算说明）", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureApply(captured)

        renderDialog()
        await pickReason(user, "质量问题")
        await user.click(screen.getByRole("button", { name: "提交申请" }))

        await waitFor(() => expect(captured).toHaveLength(1))
        expect(captured[0]).toEqual({
            orderId: "o-1",
            body: { type: "REFUND_ONLY", reasonCode: "QUALITY_ISSUE" },
        })
    })

    it("选退货退款与七天无理由并填补充说明_按 wire 形状提交并关闭弹窗", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureApply(captured)

        const onOpenChange = renderDialog()

        await user.click(screen.getByRole("radio", { name: "退货退款" }))
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
            },
        })
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("提交被拒（409 已有进行中的售后）_弹窗不关闭：不能装作提交成功", async () => {
        const user = userEvent.setup()
        server.use(
            http.post("*/orders/:id/after-sales", () =>
                HttpResponse.json(
                    { status: 409, detail: "该订单已有进行中的售后" },
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
