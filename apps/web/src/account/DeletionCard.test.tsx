import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { formatDateTime } from "@shop/app-kit"
import { renderWithProviders } from "@shop/app-kit/test"
import { server } from "@shop/test-utils"

import { DeletionCard } from "./DeletionCard"

/**
 * 注销卡集成测试：钉「两种形态各自接得对」这段最容易写反的地方——
 * 没申请时给的是毁灭性入口（点开弹窗），冷静期里给的是生效时刻 + 撤销，
 * 而撤销成功后必须回到未申请形态（靠失效重取，不是本地 setState）。
 */

const EFFECTIVE_AT = "2026-10-08T10:00:00Z"

function mockStatus(...states: { requested: boolean; effectiveAt?: string }[]) {
    let call = 0
    server.use(
        http.get("*/auth/deletion", () => {
            const next = states[Math.min(call, states.length - 1)]
            call += 1
            return HttpResponse.json(next)
        }),
    )
    return () => call
}

describe("DeletionCard", () => {
    it("未申请_给注销入口，点开就是数据处置清单", async () => {
        const user = userEvent.setup()
        mockStatus({ requested: false })
        renderWithProviders(<DeletionCard />)

        await user.click(await screen.findByRole("button", { name: "注销账号" }))

        // 清单在提交之前就要看见（个保法要的是知情删除，不是事后通知）
        expect(await screen.findByText("会清空")).toBeInTheDocument()
        expect(screen.getByText("会依法留存")).toBeInTheDocument()
    })

    it("冷静期中_显示后端给的生效时刻，没有「注销账号」这个二次入口", async () => {
        mockStatus({ requested: true, effectiveAt: EFFECTIVE_AT })
        renderWithProviders(<DeletionCard />)

        expect(await screen.findByText(formatDateTime(EFFECTIVE_AT, "zh-CN"))).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "注销账号" })).not.toBeInTheDocument()
    })

    it("撤销成功_回到未申请形态：状态是重取来的，不是本地猜的", async () => {
        const user = userEvent.setup()
        mockStatus({ requested: true, effectiveAt: EFFECTIVE_AT }, { requested: false })
        let cancelled = 0
        server.use(
            http.delete("*/auth/deletion", () => {
                cancelled += 1
                return HttpResponse.json({})
            }),
        )

        renderWithProviders(<DeletionCard />)
        await user.click(await screen.findByRole("button", { name: "撤销注销申请" }))
        await user.click(await screen.findByRole("button", { name: "撤销申请" }))

        await waitFor(() => expect(cancelled).toBe(1))
        await screen.findByRole("button", { name: "注销账号" })
    })
})
