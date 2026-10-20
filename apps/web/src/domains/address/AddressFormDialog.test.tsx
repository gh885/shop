import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { makeAddress, makeAddressParse, server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import { AddressFormDialog } from "./AddressFormDialog"

type CreateBody = unknown

function useCaptureCreate(created: CreateBody[]) {
    server.use(
        http.post("*/user/addresses", async ({ request }) => {
            created.push(await request.json())
            return HttpResponse.json(makeAddress({ id: crypto.randomUUID() }))
        }),
    )
}

const PASTE_TEXT = "张三 13800000000 浙江省杭州市西湖区文一路1号"

describe("AddressFormDialog", () => {
    it("空表单提交被校验拦截：显示必填错误、不发起请求、不关闭弹窗", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        const created: CreateBody[] = []
        useCaptureCreate(created)

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
            />,
            { resources: webMessages },
        )

        await user.click(screen.getByRole("button", { name: "保存" }))

        expect(await screen.findAllByText("这一项必填")).toHaveLength(2)
        expect(screen.getByText("格式不对")).toBeInTheDocument()
        expect(screen.getByText("请选择所在地区")).toBeInTheDocument()
        expect(created).toHaveLength(0)
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("服务端 422 的字段级错误落到对应输入框上，弹窗留在原地", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        server.use(
            http.post("*/user/addresses", () =>
                HttpResponse.json(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [{ field: "phone", message: "手机号格式错误", rule: "PATTERN" }],
                    },
                    { status: 422 },
                ),
            ),
        )

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
            />,
            { resources: webMessages },
        )

        await user.type(screen.getByLabelText("智能粘贴"), PASTE_TEXT)
        await user.click(screen.getByRole("button", { name: "粘贴并识别" }))
        await waitFor(() => expect(screen.getByLabelText("收货人姓名")).toHaveValue("张三"))
        await screen.findByText("浙江省 / 杭州市 / 西湖区")

        await user.click(screen.getByRole("button", { name: "保存" }))

        expect(await screen.findByText("格式不对")).toBeInTheDocument()
        expect(screen.queryByText("手机号格式错误")).not.toBeInTheDocument()
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("智能粘贴预填表单（地区经区划库反查），提交按契约发起创建并关闭弹窗", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        const created: CreateBody[] = []
        useCaptureCreate(created)

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
            />,
            { resources: webMessages },
        )

        await user.type(screen.getByLabelText("智能粘贴"), PASTE_TEXT)
        await user.click(screen.getByRole("button", { name: "粘贴并识别" }))

        await waitFor(() => expect(screen.getByLabelText("收货人姓名")).toHaveValue("张三"))
        await waitFor(() => expect(screen.getByLabelText("手机号码")).toHaveValue("13800000000"))
        await waitFor(() => expect(screen.getByLabelText("详细地址")).toHaveValue("文一路 1 号"))
        await screen.findByText("浙江省 / 杭州市 / 西湖区")

        await user.click(screen.getByRole("button", { name: "保存" }))

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
        expect(created).toHaveLength(1)
        expect(created[0]).toMatchObject({
            receiverName: "张三",
            phone: "13800000000",
            regionCode: "330106",
            province: "浙江省",
            city: "杭州市",
            district: "西湖区",
            detail: "文一路 1 号",
            label: "HOME",
            isDefault: false,
        })
    })

    it("粘贴认出个区划库不认的码：地区留空等手选，服务端那份名字也不抄进表单", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        const created: CreateBody[] = []
        useCaptureCreate(created)
        server.use(
            http.post("*/user/addresses/parse", () =>
                HttpResponse.json(
                    makeAddressParse({
                        regionCode: "999999",
                    }),
                ),
            ),
        )

        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={onOpenChange}
            />,
            { resources: webMessages },
        )

        await user.type(screen.getByLabelText("智能粘贴"), PASTE_TEXT)
        await user.click(screen.getByRole("button", { name: "粘贴并识别" }))

        await waitFor(() => expect(screen.getByLabelText("详细地址")).toHaveValue("文一路 1 号"))
        expect(screen.getByText("请选择省/市/区")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "保存" }))

        expect(await screen.findByText("请选择所在地区")).toBeInTheDocument()
        expect(created).toHaveLength(0)
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("编辑模式：标题切换、已有值回填", async () => {
        renderWithProviders(
            <AddressFormDialog
                open
                onOpenChange={vi.fn<(open: boolean) => void>()}
                editing={{
                    id: "addr-1",
                    receiver: "李四",
                    phone: "13900000000",
                    regionCode: "330102",
                    province: "浙江省",
                    city: "杭州市",
                    district: "上城区",
                    detail: "延安路 2 号",
                    label: "WORK",
                    isDefault: true,
                }}
            />,
            { resources: webMessages },
        )

        expect(screen.getByText("修改收货地址")).toBeInTheDocument()
        await waitFor(() => expect(screen.getByLabelText("收货人姓名")).toHaveValue("李四"))
        await waitFor(() => expect(screen.getByLabelText("详细地址")).toHaveValue("延安路 2 号"))
        await screen.findByText("浙江省 / 杭州市 / 上城区")
        expect(screen.getByRole("checkbox", { name: "设置为默认收货地址" })).toBeChecked()
    })
})
