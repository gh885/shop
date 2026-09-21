import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LoginForm, type LoginFormProps } from "./login-form"

/**
 * 共享 LoginForm 的发码交互契约（web 弹窗与 seller 登录页共用本组件，一处测两端覆盖）。
 * 这里只测发码失败分支的倒计时联动（C14）：
 * - 429 + SMS_RATE_LIMIT：服务端窗口 60s，失败也起倒计时，连点无意义；
 * - 其它失败（如图形码无效）：不起倒计时，允许改正后立即重发。
 */

const captchaOk = async () => ({ captchaId: "c1", image: "data:image/png;base64,x" })

async function fillAndSendCode(sendCode: LoginFormProps["sendCode"]) {
    render(
        <LoginForm
            getCaptcha={captchaOk}
            sendCode={sendCode}
            submit={vi.fn<LoginFormProps["submit"]>()}
            onSuccess={vi.fn<() => void>()}
        />,
    )
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } })
    fireEvent.change(screen.getByLabelText("图形验证码"), { target: { value: "AB12" } })
    // 验证码图异步落到状态后才可发码
    await screen.findByRole("button", { name: "获取验证码" })
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }))
}

beforeEach(() => {
    vi.clearAllMocks()
})

/** 发码固定失败的 sendCode 桩（ApiError 形状经 toApiError 归一） */
function failingSendCode(err: {
    status: number
    code: string
    detail: string
}): LoginFormProps["sendCode"] {
    return vi.fn<LoginFormProps["sendCode"]>(async () => {
        throw err
    })
}

describe("发码失败与倒计时", () => {
    it("429限频_失败也起60s倒计时", async () => {
        await fillAndSendCode(
            failingSendCode({
                status: 429,
                code: "SMS_RATE_LIMIT",
                detail: "发送过于频繁，请稍后再试",
            }),
        )

        expect(await screen.findByText("60s 后重发")).toBeInTheDocument()
    })

    it("其它发码失败_不起倒计时", async () => {
        await fillAndSendCode(
            failingSendCode({
                status: 400,
                code: "CAPTCHA_INVALID",
                detail: "图形验证码错误",
            }),
        )

        // 错误后无「Ns 后重发」倒计时；图形码失败会重置验证码图（按钮 disabled 待重输，属既有行为）
        expect(await screen.findByRole("button", { name: "获取验证码" })).toBeTruthy()
        expect(screen.queryByText(/后重发/)).not.toBeInTheDocument()
    })
})
