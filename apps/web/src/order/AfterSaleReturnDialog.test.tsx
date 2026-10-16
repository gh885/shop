import type { ComponentProps } from "react"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import { AfterSaleReturnDialog } from "./AfterSaleReturnDialog"

type Captured = unknown

function useCaptureReturn(captured: Captured[]) {
    server.use(
        http.put("*/orders/:id/after-sales/return", async ({ request }) => {
            captured.push(await request.json())
            return new HttpResponse(null, { status: 204 })
        }),
    )
}

function renderDialog(
    props: Partial<ComponentProps<typeof AfterSaleReturnDialog>> = {},
    onOpenChange = vi.fn<(open: boolean) => void>(),
) {
    renderWithProviders(
        <AfterSaleReturnDialog
            open
            onOpenChange={onOpenChange}
            orderId="o-1"
            {...props}
        />,
        { resources: webMessages },
    )
    return onOpenChange
}

describe("AfterSaleReturnDialog", () => {
    it("空表单提交_两项都被校验拦下、不发请求", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureReturn(captured)

        const onOpenChange = renderDialog()
        await user.click(screen.getByRole("button", { name: "提交" }))

        expect(await screen.findAllByText("这一项必填")).toHaveLength(2)
        expect(captured).toHaveLength(0)
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
    })

    it("填写带空格的快递公司与运单号_提交前清空格（运单号要能被承运商推送精确匹配）", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureReturn(captured)

        const onOpenChange = renderDialog()
        await user.type(screen.getByLabelText("快递公司"), "  顺丰速运 ")
        await user.type(screen.getByLabelText("运单号"), " SF12345678 ")
        await user.click(screen.getByRole("button", { name: "提交" }))

        await waitFor(() => expect(captured).toHaveLength(1))
        expect(captured[0]).toEqual({
            logisticsCompany: "顺丰速运",
            trackingNo: "SF12345678",
        })
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("已有回寄单_按现有值回填，允许改单重交", async () => {
        renderDialog({ defaultLogisticsCompany: "中通快递", defaultTrackingNo: "ZT999" })

        expect(screen.getByLabelText("快递公司")).toHaveValue("中通快递")
        expect(screen.getByLabelText("运单号")).toHaveValue("ZT999")
    })

    it("卖家配了默认退货地址_寄回目的地原样展示", async () => {
        renderDialog({ returnAddress: "退件员 13800001234 · 浙江省杭州市西湖区文一路 100 号" })

        expect(screen.getByText("请把商品寄回以下地址")).toBeInTheDocument()
        expect(
            screen.getByText("退件员 13800001234 · 浙江省杭州市西湖区文一路 100 号"),
        ).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "提交" })).toBeEnabled()
    })

    it("卖家未设置退货地址_提示联系客服，但不挡单号登记", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureReturn(captured)
        renderDialog({ returnAddress: null })

        expect(screen.getByText("卖家未设置退货地址，请先联系客服")).toBeInTheDocument()

        await user.type(screen.getByLabelText("快递公司"), "顺丰速运")
        await user.type(screen.getByLabelText("运单号"), "SF12345678")
        await user.click(screen.getByRole("button", { name: "提交" }))
        await waitFor(() => expect(captured).toHaveLength(1))
    })
})
