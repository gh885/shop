import type { ShipmentIssueResponse } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"
import { NOTE_MAX } from "@shop/common/domain"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"
import { adminMessages } from "#/locales"
import { IssueResolveAction } from "./resolve-action"

const ISSUE: ShipmentIssueResponse = {
    id: "00000000-0000-4000-8000-0000000000dd",
    shipmentId: "00000000-0000-4000-8000-0000000000cc",
    type: "PICKUP_TIMEOUT",
    status: "OPEN",
    detail: "下单后超过 48 小时仍未有揽收记录",
    detectedAt: "2026-09-23T10:00:00Z",
    resolvedAt: null,
}

function useResolveRoutes() {
    const calls: unknown[] = []
    server.use(
        http.put("*/admin/logistics/issues/:id/resolve", async ({ request }) => {
            calls.push(await request.json())
            return HttpResponse.json({}, { status: 200 })
        }),
    )
    return calls
}

describe("IssueResolveAction", () => {
    it("结单：弹窗展示异常类型与说明，带备注提交成功后收起", async () => {
        const calls = useResolveRoutes()
        renderWithProviders(<IssueResolveAction issue={ISSUE} />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        expect(await screen.findByText("处置物流异常")).toBeInTheDocument()
        expect(screen.getByText(/揽收超时/)).toBeInTheDocument()
        expect(screen.getByText(/48 小时/)).toBeInTheDocument()

        await user.type(screen.getByRole("textbox"), "已电话催件，承运商承诺明早派送")
        await user.click(screen.getByRole("button", { name: "确认处置" }))

        await waitFor(() => expect(calls).toEqual([{ note: "已电话催件，承运商承诺明早派送" }]))
        await waitFor(() => expect(screen.queryByText("处置物流异常")).toBeNull())
    })

    it("备注可留空：结单请求不带空 note 字段", async () => {
        const calls = useResolveRoutes()
        renderWithProviders(<IssueResolveAction issue={ISSUE} />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        await user.click(await screen.findByRole("button", { name: "确认处置" }))

        await waitFor(() => expect(calls).toEqual([{}]))
    })

    it("无补充说明的异常单也留得下现场记录", async () => {
        useResolveRoutes()
        renderWithProviders(<IssueResolveAction issue={{ ...ISSUE, detail: null }} />, {
            resources: adminMessages,
        })
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        expect(await screen.findByText(/无补充说明/)).toBeInTheDocument()
    })

    // maxLength 平时先把着，这条 422 分支要真发出去才走得到；断的是「用户看得见的那句由 catalog 按 rule 出，不是后端那句中文」
    it("服务端 422 的备注长度错误落进弹窗里的备注框，弹窗不收起", async () => {
        server.use(
            http.put("*/admin/logistics/issues/:id/resolve", () =>
                HttpResponse.json(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [
                            {
                                field: "note",
                                message: `处置备注最长 ${NOTE_MAX} 字`,
                                rule: "MAX_LENGTH",
                                max: NOTE_MAX,
                            },
                        ],
                    },
                    { status: 422 },
                ),
            ),
        )
        renderWithProviders(<IssueResolveAction issue={ISSUE} />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        await user.type(screen.getByRole("textbox"), "催过了")
        await user.click(screen.getByRole("button", { name: "确认处置" }))

        expect(await screen.findByText(`最长 ${NOTE_MAX} 个字`)).toBeInTheDocument()
        expect(screen.queryByText(`处置备注最长 ${NOTE_MAX} 字`)).not.toBeInTheDocument()
        // 没落成就不收起：结单失败还收起弹窗就是一条假待办
        expect(screen.getByText("处置物流异常")).toBeInTheDocument()
    })

    // 看门人：表单实例建在弹窗之外、只靠成功后 form.reset() 兜是漏过的真 bug，把实例挪回外层本条即红
    it("取消后重开：上一轮写了一半的备注不残留", async () => {
        useResolveRoutes()
        renderWithProviders(<IssueResolveAction issue={ISSUE} />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        await user.type(await screen.findByRole("textbox"), "写了一半就关了")
        await user.click(screen.getByRole("button", { name: "取消" }))
        await waitFor(() => expect(screen.queryByText("处置物流异常")).toBeNull())

        await user.click(screen.getByRole("button", { name: "处置" }))
        expect(await screen.findByRole("textbox")).toHaveValue("")
    })
})
