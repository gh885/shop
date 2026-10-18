import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import type { CarrierResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { sellerMessages } from "#/locales"
import { ShipDialog } from "./ship-dialog"
import type { ShipInput } from "./ship-form"
import type { OrderIdentity } from "./table"

const CARRIERS: CarrierResponse[] = [
    { code: "SF", name: "顺丰速运" },
    { code: "ZTO", name: "中通快递" },
]

function makeOrder(orderNo = "NO20260912001"): OrderIdentity {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        orderNo,
        items: [
            {
                orderItemId: "00000000-0000-7000-8000-000000000001",
                productId: "p-1",
                skuId: "sku-1",
                name: "测试商品",
                image: null,
                price: { amount: 1000, currency: "CNY" },
                originalPrice: null,
                quantity: 3,
                shippedQuantity: 1,
                refundedQuantity: 0,
                amount: { amount: 3000, currency: "CNY" },
            },
        ],
    }
}

function useCarrierList(carriers: CarrierResponse[] = CARRIERS) {
    server.use(http.get("*/seller/carriers", () => HttpResponse.json(carriers)))
}

async function fillCarrierAndTracking(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByLabelText("快递公司"))
    await user.click(await screen.findByRole("option", { name: "顺丰速运" }))
    await user.type(screen.getByLabelText("运单号"), "SF123456789")
}

describe("ShipDialog", () => {
    it("选中快递公司后提交：onShip 拿到字典 code、运单号与按行发量，弹窗关闭", async () => {
        const user = userEvent.setup()
        const onShip = vi.fn<(orderId: string, input: ShipInput) => void>()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        useCarrierList()

        const order = makeOrder()
        renderWithProviders(
            <ShipDialog
                open
                order={order}
                onOpenChange={onOpenChange}
                onShip={onShip}
            />,
            { resources: sellerMessages },
        )

        await fillCarrierAndTracking(user)
        await user.click(screen.getByRole("button", { name: "发货" }))

        await waitFor(() =>
            expect(onShip).toHaveBeenCalledWith(order.id, {
                carrierCode: "SF",
                trackingNo: "SF123456789",
                // 默认把剩余量（买 3 发 1）全部装进这一张单
                lines: [{ orderItemId: "00000000-0000-7000-8000-000000000001", quantity: 2 }],
            }),
        )
        // onSubmit 现在 await onShip 后才关窗，关窗是异步的：用 waitFor 接住那条 microtask
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("改过发量就按改后的数量提交：拆包裹时不必清空再填", async () => {
        const user = userEvent.setup()
        const onShip = vi.fn<(orderId: string, input: ShipInput) => Promise<unknown> | void>()
        useCarrierList()

        renderWithProviders(
            <ShipDialog
                open
                order={makeOrder()}
                onOpenChange={() => {}}
                onShip={onShip}
            />,
            { resources: sellerMessages },
        )

        const quantity = screen.getByLabelText("测试商品 发货数量")
        await user.clear(quantity)
        await user.type(quantity, "1")
        await fillCarrierAndTracking(user)
        await user.click(screen.getByRole("button", { name: "发货" }))

        await waitFor(() =>
            expect(onShip).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    lines: [{ orderItemId: "00000000-0000-7000-8000-000000000001", quantity: 1 }],
                }),
            ),
        )
    })

    it("一行都不发就提交：提示至少选一行，不发请求、不关窗", async () => {
        const user = userEvent.setup()
        const onShip = vi.fn<(orderId: string, input: ShipInput) => Promise<unknown> | void>()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        useCarrierList()

        renderWithProviders(
            <ShipDialog
                open
                order={makeOrder()}
                onOpenChange={onOpenChange}
                onShip={onShip}
            />,
            { resources: sellerMessages },
        )

        const quantity = screen.getByLabelText("测试商品 发货数量")
        await user.clear(quantity)
        await fillCarrierAndTracking(user)
        await user.click(screen.getByRole("button", { name: "发货" }))

        expect(await screen.findByText("至少选一行发货")).toBeInTheDocument()
        expect(onShip).not.toHaveBeenCalled()
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("onShip 抛 422：字段级错误落到运单号框上，弹窗不关", async () => {
        const user = userEvent.setup()
        const onShip = vi
            .fn<(orderId: string, input: ShipInput) => Promise<unknown>>()
            .mockRejectedValue({
                status: 422,
                detail: "输入校验失败（1 个字段错误）",
                errors: [{ field: "trackingNo", message: "运单号格式不正确", rule: "PATTERN" }],
            })
        const onOpenChange = vi.fn<(open: boolean) => void>()
        useCarrierList()

        renderWithProviders(
            <ShipDialog
                open
                order={makeOrder()}
                onOpenChange={onOpenChange}
                onShip={onShip}
            />,
            { resources: sellerMessages },
        )

        await fillCarrierAndTracking(user)
        await user.click(screen.getByRole("button", { name: "发货" }))

        // 那句由前端 catalog 按 rule 出（zh-Hans-CN「格式不对」），不是后端 message
        expect(await screen.findByText("格式不对")).toBeInTheDocument()
        expect(screen.queryByText("运单号格式不正确")).not.toBeInTheDocument()
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
    })

    it("没选快递公司就提交：提示必填、不提交、不关闭弹窗", async () => {
        const user = userEvent.setup()
        const onShip = vi.fn<(orderId: string, input: ShipInput) => Promise<unknown> | void>()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        useCarrierList()

        renderWithProviders(
            <ShipDialog
                open
                order={makeOrder()}
                onOpenChange={onOpenChange}
                onShip={onShip}
            />,
            { resources: sellerMessages },
        )

        await user.type(screen.getByLabelText("运单号"), "SF123456789")
        await user.click(screen.getByRole("button", { name: "发货" }))

        // 「这一项必填」走 catalog 的 validation.REQUIRED：与后端 422 同一 @NotBlank 同一句，不另写
        expect(await screen.findByText("这一项必填")).toBeInTheDocument()
        expect(onShip).not.toHaveBeenCalled()
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})
