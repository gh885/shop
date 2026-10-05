import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { webMessages } from "#/locales"
import { DeletionDialog } from "./DeletionDialog"

/**
 * 注销弹窗集成测试：真实 TanStack Form + React Query + MSW，只 mock HTTP。
 *
 * 钉的是三件最容易悄悄坏掉的事：
 * 1. 没过验证码就不该有「提交」这条路（前端校验先拦，一条注销请求都不发）
 * 2. 验证码是发给绑定号码的命令，与提交是两条不同的口子，别把 code 塞进发码请求
 * 3. 提交被拒时弹窗必须留在原地并标红输入框——关掉弹窗等于假装申请成功了
 */

type Captured = { codePath: number; submitBodies: unknown[] }

function mockEndpoints(captured: Captured, submit?: () => Response) {
    server.use(
        http.post("*/auth/deletion/code", () => {
            captured.codePath += 1
            return HttpResponse.json({})
        }),
        http.post("*/auth/deletion", async ({ request }) => {
            captured.submitBodies.push(await request.json())
            return submit ? submit() : HttpResponse.json({})
        }),
    )
}

function renderDialog(onOpenChange = vi.fn<(open: boolean) => void>()) {
    renderWithProviders(
        <DeletionDialog
            open
            onOpenChange={onOpenChange}
        />,
        { resources: webMessages },
    )
    return onOpenChange
}

const codeInput = () => screen.getByLabelText("短信验证码")

describe("DeletionDialog", () => {
    it("验证码留空就提交_被校验拦下：一条请求都不发", async () => {
        const user = userEvent.setup()
        const captured: Captured = { codePath: 0, submitBodies: [] }
        mockEndpoints(captured)

        const onOpenChange = renderDialog()
        await user.click(screen.getByRole("button", { name: "提交注销申请" }))

        await waitFor(() => expect(screen.getByText("请输入 6 位验证码")).toBeInTheDocument())
        expect(captured.codePath).toBe(0)
        expect(captured.submitBodies).toHaveLength(0)
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
    })

    it("先取码再提交_两条口子各发各的，输进去的字母被剥掉，成功后关窗", async () => {
        const user = userEvent.setup()
        const captured: Captured = { codePath: 0, submitBodies: [] }
        mockEndpoints(captured)

        const onOpenChange = renderDialog()
        await user.type(codeInput(), "12x34y56")
        await user.click(screen.getByRole("button", { name: "获取验证码" }))
        await user.click(screen.getByRole("button", { name: "提交注销申请" }))

        await waitFor(() => expect(captured.submitBodies).toHaveLength(1))
        expect(captured.codePath).toBe(1)
        expect(captured.submitBodies[0]).toEqual({ code: "123456" })
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("提交被拒（400 验证码错误）_弹窗不关、输入框标红，重新输入即清错", async () => {
        const user = userEvent.setup()
        const captured: Captured = { codePath: 0, submitBodies: [] }
        mockEndpoints(captured, () =>
            HttpResponse.json(
                { status: 400, code: "SMS_CODE_INVALID", detail: "验证码错误" },
                { status: 400 },
            ),
        )

        const onOpenChange = renderDialog()
        await user.type(codeInput(), "000000")
        await user.click(screen.getByRole("button", { name: "提交注销申请" }))

        await waitFor(() => expect(screen.getByText("验证码错误")).toBeInTheDocument())
        expect(codeInput()).toHaveAttribute("aria-invalid", "true")
        expect(onOpenChange).not.toHaveBeenCalledWith(false)

        // 重新输入即清错（标红随之消失）：先清一格，因为满 6 位后 maxLength 会挡住继续输入
        await user.clear(codeInput())
        await user.type(codeInput(), "1")
        expect(codeInput()).toHaveAttribute("aria-invalid", "false")
        expect(screen.queryByText("验证码错误")).not.toBeInTheDocument()
    })

    it("发码被限流（429）_照样起 60s 倒计时，连点只会再撞一次限流", async () => {
        const user = userEvent.setup()
        const captured: Captured = { codePath: 0, submitBodies: [] }
        server.use(
            http.post("*/auth/deletion/code", () => {
                captured.codePath += 1
                return HttpResponse.json(
                    { status: 429, code: "SMS_RATE_LIMIT", detail: "发送过于频繁，请稍后再试" },
                    { status: 429 },
                )
            }),
        )

        renderDialog()
        await user.click(screen.getByRole("button", { name: "获取验证码" }))

        const again = await screen.findByRole("button", { name: "60s 后重发" })
        expect(again).toBeDisabled()
        expect(captured.codePath).toBe(1)
    })
})
