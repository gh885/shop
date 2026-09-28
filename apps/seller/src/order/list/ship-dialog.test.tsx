import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import type { CarrierResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { ShipDialog } from "./ship-dialog"
import type { OrderIdentity } from "./table"

/**
 * ShipDialog 集成测试：走真实 React Query + MSW 网络层（handler 遵循 openapi 契约）。
 *
 * 钉住的是「发货改承运商字典」这件事本身：下拉交出去的是字典 code，不是展示名。
 * 曾经这里是自由文本框，"顺丰速运"/"顺丰"/"SF" 都会原样落库，统计与对接物流商都没法做。
 */

const CARRIERS: CarrierResponse[] = [
    { code: "SF", name: "顺丰速运" },
    { code: "ZTO", name: "中通快递" },
]

/** 测试夹具：弹窗只读 id 与 orderNo，就只给这两项 */
function makeOrder(orderNo = "NO20260912001"): OrderIdentity {
    return { id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001", orderNo }
}

function useCarrierList(carriers: CarrierResponse[] = CARRIERS) {
    server.use(http.get("*/seller/carriers", () => HttpResponse.json(carriers)))
}

describe("ShipDialog", () => {
    it("选中快递公司后提交：onShip 拿到字典 code 与运单号，弹窗关闭", async () => {
        const user = userEvent.setup()
        const onShip =
            vi.fn<(orderId: string, input: { carrierCode: string; trackingNo: string }) => void>()
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
        )

        await user.click(await screen.findByLabelText("快递公司"))
        await user.click(await screen.findByRole("option", { name: "顺丰速运" }))
        await user.type(screen.getByLabelText("运单号"), "SF123456789")
        await user.click(screen.getByRole("button", { name: "发货" }))

        await waitFor(() =>
            expect(onShip).toHaveBeenCalledWith(order.id, {
                carrierCode: "SF",
                trackingNo: "SF123456789",
            }),
        )
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("没选快递公司就提交：提示必填、不提交、不关闭弹窗", async () => {
        const user = userEvent.setup()
        const onShip =
            vi.fn<(orderId: string, input: { carrierCode: string; trackingNo: string }) => void>()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        useCarrierList()

        renderWithProviders(
            <ShipDialog
                open
                order={makeOrder()}
                onOpenChange={onOpenChange}
                onShip={onShip}
            />,
        )

        await user.type(screen.getByLabelText("运单号"), "SF123456789")
        await user.click(screen.getByRole("button", { name: "发货" }))

        expect(await screen.findByText("请选择快递公司")).toBeInTheDocument()
        expect(onShip).not.toHaveBeenCalled()
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})
