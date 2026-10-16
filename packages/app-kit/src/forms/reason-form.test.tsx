import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vite-plus/test"

import { NOTE_MAX } from "@shop/common/domain"

import { ReasonForm } from "./reason-form"
import { renderWithProviders } from "../test"

/** ReasonForm 的 422 落框通道（收在组件里，非每个调用点各接），钉后端字段明细落回理由框错误位 */
function validation422(
    errors: Array<{ field: string; message: string; rule?: string; min?: number; max?: number }>,
) {
    return { status: 422, detail: "参数校验失败", errors }
}

const reasonBox = () => screen.getByRole("textbox", { name: "拒绝理由" })

function renderForm(props: {
    onSubmit: (reason: string) => Promise<unknown> | void
    serverFields?: Record<string, "reason">
}) {
    renderWithProviders(
        <ReasonForm
            maxLength={NOTE_MAX}
            label="拒绝理由"
            placeholder="例如：退回商品缺少吊牌"
            submitLabel="确认拒绝"
            onCancel={vi.fn<() => void>()}
            serverFields={props.serverFields}
            onSubmit={props.onSubmit}
        />,
    )
}

async function submitReason(text = "退回商品缺少吊牌，影响二次销售") {
    const user = userEvent.setup()
    await user.type(await screen.findByRole("textbox", { name: "拒绝理由" }), text)
    await user.click(screen.getByRole("button", { name: "确认拒绝" }))
}

describe("ReasonForm 的后端字段级错误", () => {
    it("422 的那句话落回理由框（默认同名映射，调用点无需传 map）", async () => {
        const onSubmit = vi.fn<(reason: string) => Promise<unknown>>(async () => {
            throw validation422([
                { field: "reason", message: "拒绝理由最长 200 字", rule: "MAX_LENGTH", max: 200 },
            ])
        })
        renderForm({ onSubmit })
        await submitReason()

        expect(await screen.findByText("最长 200 个字")).toBeInTheDocument()
    })

    it("改值后那句红消失，改对了还能再提交（红挂着 = canSubmit 永远 false = 提交不了）", async () => {
        const onSubmit = vi
            .fn<(reason: string) => Promise<unknown>>()
            .mockRejectedValueOnce(
                validation422([
                    {
                        field: "reason",
                        message: "拒绝理由最长 200 字",
                        rule: "MAX_LENGTH",
                        max: 200,
                    },
                ]),
            )
            .mockResolvedValueOnce(undefined)
        renderForm({ onSubmit })
        const user = userEvent.setup()
        const box = await screen.findByRole("textbox", { name: "拒绝理由" })

        // 验证整段超长输入的错误恢复，不测试 210 次键盘事件；粘贴同样经过真实表单 onChange。
        await user.click(box)
        await user.paste("x".repeat(210))
        await user.click(screen.getByRole("button", { name: "确认拒绝" }))
        expect(await screen.findByText("最长 200 个字")).toBeInTheDocument()

        await user.clear(box)
        await user.type(box, "短一点的理由")
        expect(screen.queryByText("最长 200 个字")).not.toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "确认拒绝" }))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
        expect(screen.queryByText("最长 200 个字")).not.toBeInTheDocument()
    })

    it("白名单：服务端路径没列进 map 就不落红", async () => {
        const onSubmit = vi.fn<(reason: string) => Promise<unknown>>(async () => {
            throw validation422([{ field: "note", message: "备注太长，请精简" }])
        })
        renderForm({ onSubmit })
        await submitReason()

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(reasonBox()).toHaveValue("退回商品缺少吊牌，影响二次销售")
        expect(screen.queryByText("备注太长，请精简")).not.toBeInTheDocument()
    })

    it("调用点可声明「服务端路径 → 自家框」的对应关系", async () => {
        const onSubmit = vi.fn<(reason: string) => Promise<unknown>>(async () => {
            throw validation422([
                { field: "rejectReason", message: "驳回理由不能为空", rule: "REQUIRED" },
            ])
        })
        renderForm({ onSubmit, serverFields: { rejectReason: "reason" } })
        await submitReason()

        expect(await screen.findByText("这一项必填")).toBeInTheDocument()
    })

    it("提交动作同步返回（fire-and-forget）时不炸：这条通道只是不亮", async () => {
        const onSubmit = vi.fn<(reason: string) => void>()
        renderForm({ onSubmit })
        await submitReason()

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("退回商品缺少吊牌，影响二次销售"))
        expect(screen.queryByText("最长 200 个字")).not.toBeInTheDocument()
    })
})
