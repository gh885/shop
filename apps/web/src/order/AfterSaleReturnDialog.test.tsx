import type { ComponentProps } from "react"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import { AfterSaleReturnDialog } from "./AfterSaleReturnDialog"

/**
 * 回寄退货填单测试：这一步把退货物流登记成 logistics 的 RETURN 包裹，
 * 所以「填了什么 → wire 上是什么」必须准（首尾空格要清掉，否则承运商推送按运单号匹配不上）。
 * 另一半责任是「寄到哪」：地址来自售后详情的 returnAddress（查询时实时解析），
 * 有就原样给买家，没有就说「联系客服」——不编地址，也不因此卡住单号登记。
 */

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
        // 弹窗的标题/说明/字段名走本端 catalog，所以要把 web 的 resources 传进去；
        // 默认那份只有 app-kit 的文案，本端 key 会回落成 key 本身（详见 renderWithProviders 的注释）
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

        // 两句都是 catalog 的 `validation.REQUIRED`——与后端两个 @NotBlank 经 422 出的是同一句话，
        // 靠「挂在哪个字段下面」区分，不靠措辞区分
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
        // 地址缺失与否都不该挡住登记本身：表单照常可提交
        expect(screen.getByRole("button", { name: "提交" })).toBeEnabled()
    })

    it("卖家未设置退货地址_提示联系客服，但不挡单号登记", async () => {
        const user = userEvent.setup()
        const captured: Captured[] = []
        useCaptureReturn(captured)
        renderDialog({ returnAddress: null })

        expect(screen.getByText("卖家未设置退货地址，请先联系客服")).toBeInTheDocument()

        // null 语义只关乎「寄到哪」，不关乎「能不能登记」：填完照样能提交
        await user.type(screen.getByLabelText("快递公司"), "顺丰速运")
        await user.type(screen.getByLabelText("运单号"), "SF12345678")
        await user.click(screen.getByRole("button", { name: "提交" }))
        await waitFor(() => expect(captured).toHaveLength(1))
    })
})
