import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { formatDateTime } from "@shop/app-kit/display"
import { renderWithProviders } from "@shop/app-kit/test"
import { server } from "@shop/test-utils"

import { webMessages } from "#/locales"
import { DeletionCard } from "./DeletionCard"

const EFFECTIVE_AT = "2026-10-08T10:00:00Z"

function mockStatus(
    ...states: { requested: boolean; effectiveAt?: string; coolingOffDays?: number }[]
) {
    let call = 0
    server.use(
        http.get("*/auth/deletion", () => {
            const next = states[Math.min(call, states.length - 1)]
            call += 1
            return HttpResponse.json({ coolingOffDays: 15, ...next })
        }),
    )
    return () => call
}

describe("DeletionCard", () => {
    it("未申请_给注销入口，点开就是数据处置清单", async () => {
        const user = userEvent.setup()
        mockStatus({ requested: false })
        renderWithProviders(<DeletionCard />, { resources: webMessages })

        await user.click(await screen.findByRole("button", { name: "注销账号" }))

        expect(await screen.findByText("会清空")).toBeInTheDocument()
        expect(screen.getByText("会依法留存")).toBeInTheDocument()
        // 冷静期天数来自后端状态（单一真相源），不是前端写死：文案里的 15 天由 status.coolingOffDays 喂进来
        expect(screen.getByText(/15 天冷静期/)).toBeInTheDocument()
    })

    it("冷静期中_显示后端给的生效时刻，没有「注销账号」这个二次入口", async () => {
        mockStatus({ requested: true, effectiveAt: EFFECTIVE_AT })
        renderWithProviders(<DeletionCard />, { resources: webMessages })

        const expectedTime = formatDateTime(EFFECTIVE_AT, "zh-Hans-CN")
        const line = await screen.findByText(
            (_content, element) =>
                element?.tagName === "P" && element.textContent.includes(expectedTime),
        )
        expect(line).toBeInTheDocument()
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

        renderWithProviders(<DeletionCard />, { resources: webMessages })
        await user.click(await screen.findByRole("button", { name: "撤销注销申请" }))
        await user.click(await screen.findByRole("button", { name: "撤销申请" }))

        await waitFor(() => expect(cancelled).toBe(1))
        await screen.findByRole("button", { name: "注销账号" })
    })
})
