import type { ShipmentIssueResponse } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"
import { NOTE_MAX } from "@shop/common"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"
import { IssueResolveAction } from "./resolve-action"

/**
 * 物流异常单结单（LOG-33）：一张单处理完就不在待办里了，备注是它唯一留下的现场痕迹。
 * 钉四件事：① 结单带着备注提交（备注是给下一班人看的，不是可选项摆着好看）；
 * ② 留空也能结单，但发出去的请求体不该塞一个空 note；③ 成功后弹窗收起（结完还挂着就是假待办）；
 * ④ 后端 422 的字段级明细落在那格 textarea 上，而不是只剩一句 toast。
 */

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
        renderWithProviders(<IssueResolveAction issue={ISSUE} />)
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        expect(await screen.findByText("处置物流异常")).toBeInTheDocument()
        // 类型给中文（揽收超时）、说明原样带出，运维一眼看清这是哪张单
        expect(screen.getByText(/揽收超时/)).toBeInTheDocument()
        expect(screen.getByText(/48 小时/)).toBeInTheDocument()

        await user.type(screen.getByRole("textbox"), "已电话催件，承运商承诺明早派送")
        await user.click(screen.getByRole("button", { name: "确认处置" }))

        await waitFor(() => expect(calls).toEqual([{ note: "已电话催件，承运商承诺明早派送" }]))
        // 成功后弹窗收起：结完还挂着就是一条假待办
        await waitFor(() => expect(screen.queryByText("处置物流异常")).toBeNull())
    })

    it("备注可留空：结单请求不带空 note 字段", async () => {
        const calls = useResolveRoutes()
        renderWithProviders(<IssueResolveAction issue={ISSUE} />)
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        await user.click(await screen.findByRole("button", { name: "确认处置" }))

        // 空白 note 折成 undefined，序列化后这个键整个消失，而不是发一个空串占用后端列
        await waitFor(() => expect(calls).toEqual([{}]))
    })

    it("无补充说明的异常单也留得下现场记录", async () => {
        useResolveRoutes()
        renderWithProviders(<IssueResolveAction issue={{ ...ISSUE, detail: null }} />)
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        // 说明那格是 {类型}：{detail ?? 占位} 拼出来的多段文本节点，按正则匹配整段
        expect(await screen.findByText(/无补充说明/)).toBeInTheDocument()
    })

    /**
     * 422 的字段级明细落到那格 textarea 上（这条通道在 admin 端的端到端一格）。
     * maxLength 平时先把着，所以这条分支要真发出去才走得到；断的是「用户看得见的那句由 catalog 按
     * rule 出」——后端那句中文 message 不该出现在界面上（它只进日志与中文界面的兜底格）。
     */
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
        renderWithProviders(<IssueResolveAction issue={ISSUE} />)
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "处置" }))
        await user.type(screen.getByRole("textbox"), "催过了")
        await user.click(screen.getByRole("button", { name: "确认处置" }))

        // 句子是前端 catalog 按 rule + max 出的那句，而不是后端注解上那句中文
        expect(await screen.findByText(`最长 ${NOTE_MAX} 个字`)).toBeInTheDocument()
        expect(screen.queryByText(`处置备注最长 ${NOTE_MAX} 字`)).not.toBeInTheDocument()
        // 没落成就不收起：结单失败还收起弹窗就是一条假待办
        expect(screen.getByText("处置物流异常")).toBeInTheDocument()
    })
})
