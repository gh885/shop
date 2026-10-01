import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { Toaster } from "@shop/ui-web"

import { APP_KIT_MESSAGES, I18nProvider, createLocaleScope } from "../i18n"
import { LoginForm, type LoginFormProps } from "./login-form"

/**
 * 共享 LoginForm 的交互契约（web 弹窗与 seller 登录页共用本组件，一处测两端覆盖）。
 * 这里测三件事：
 * 1. 登录方式切换——激活项必须是 role=tab + aria-selected=true（不能只靠字重/下划线表达），
 *    且键盘能走到、能激活；
 * 2. 人机验证浮层：点「获取验证码」才出现，验证通过才发码；
 * 3. 发码失败分支的倒计时联动（C14）与失败文案的来源（§7.3：命中 code 走 catalog，不是 detail）。
 */

const captchaOk = async () => ({ captchaId: "c1", image: "data:image/png;base64,x" })

function renderLoginForm(sendCode?: LoginFormProps["sendCode"]) {
    return render(
        <I18nProvider
            resources={APP_KIT_MESSAGES}
            scope={createLocaleScope("zh-CN")}
            initialLocale="zh-CN"
        >
            {/* 发码失败的提示走全局 toast（notify.fromError），不挂宿主就捞不到那句话 */}
            <Toaster />
            <LoginForm
                getCaptcha={captchaOk}
                sendCode={sendCode ?? vi.fn<LoginFormProps["sendCode"]>()}
                submit={vi.fn<LoginFormProps["submit"]>()}
                onSuccess={vi.fn<() => void>()}
            />
        </I18nProvider>,
    )
}

/** 填手机号并点开发码浮层（图形码输入就在浮层里） */
async function openCaptchaPopover() {
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } })
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }))
    // 浮层里的图形码输入框
    return screen.findByLabelText("图形验证码")
}

/** 走完「填手机号 → 开浮层 → 填图形码 → 验证并发送」 */
async function fillAndSendCode(sendCode: LoginFormProps["sendCode"]) {
    renderLoginForm(sendCode)
    const captchaInput = await openCaptchaPopover()
    fireEvent.change(captchaInput, { target: { value: "AB12" } })
    fireEvent.click(screen.getByRole("button", { name: "验证并发送" }))
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

describe("登录方式切换", () => {
    it("激活项带tab语义_点击后aria_selected转移", async () => {
        renderLoginForm()
        expect(screen.getByRole("tab", { name: "验证码登录" })).toHaveAttribute(
            "aria-selected",
            "true",
        )
        expect(screen.getByRole("tab", { name: "密码登录" })).toHaveAttribute(
            "aria-selected",
            "false",
        )

        fireEvent.click(screen.getByRole("tab", { name: "密码登录" }))

        expect(await screen.findByLabelText("密码")).toBeInTheDocument()
        expect(screen.getByRole("tab", { name: "密码登录" })).toHaveAttribute(
            "aria-selected",
            "true",
        )
        expect(screen.getByRole("tab", { name: "验证码登录" })).toHaveAttribute(
            "aria-selected",
            "false",
        )
        // 密码 Tab 不该留着短信 Tab 的人机验证输入
        expect(screen.queryByLabelText("图形验证码")).not.toBeInTheDocument()
    })

    it("键盘可达：Tab 进页签，方向键移焦，回车激活", async () => {
        const user = userEvent.setup()
        renderLoginForm()
        await user.tab()
        expect(screen.getByRole("tab", { name: "验证码登录" })).toHaveFocus()

        // Base UI 页签是「手动激活」：方向键只移焦，Enter/Space 才切内容
        await user.keyboard("{ArrowRight}")
        expect(screen.getByRole("tab", { name: "密码登录" })).toHaveFocus()
        expect(screen.getByRole("tab", { name: "密码登录" })).toHaveAttribute(
            "aria-selected",
            "false",
        )

        await user.keyboard("{Enter}")
        expect(screen.getByRole("tab", { name: "密码登录" })).toHaveAttribute(
            "aria-selected",
            "true",
        )
    })
})

describe("发码按钮的就绪判定", () => {
    it("点「获取验证码」才弹人机验证浮层：图形码不占地表单一整行", async () => {
        renderLoginForm()
        // 初始：图形码输入框不存在
        expect(screen.queryByLabelText("图形验证码")).not.toBeInTheDocument()

        fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } })
        fireEvent.click(screen.getByRole("button", { name: "获取验证码" }))

        expect(await screen.findByLabelText("图形验证码")).toBeInTheDocument()
    })

    it("手机号非法就点：不打开浮层，聚焦手机号", async () => {
        renderLoginForm()
        fireEvent.click(screen.getByRole("button", { name: "获取验证码" }))
        expect(screen.queryByLabelText("图形验证码")).not.toBeInTheDocument()
        expect(screen.getByLabelText("手机号")).toHaveFocus()
    })

    it("发码按钮始终可点（除非倒计时/发码中）：不因为前置未满足而置灰", async () => {
        renderLoginForm()
        // 图还没到、空表单：按钮也必须可点，否则用户无从知道缺什么
        const send = await screen.findByRole("button", { name: "获取验证码" })
        expect(send).not.toBeDisabled()
    })

    it("浮层里图形码没填满就提交：聚焦图形码而不是静默无反应", async () => {
        renderLoginForm()
        const captchaInput = await openCaptchaPopover()
        fireEvent.click(screen.getByRole("button", { name: "验证并发送" }))
        expect(captchaInput).toHaveFocus()
    })
})

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

        // 错误后无「Ns 后重发」倒计时；图形码失败会重置验证码图，浮层留着让用户改正后重发
        expect(await screen.findByRole("button", { name: "验证并发送" })).toBeTruthy()
        expect(screen.queryByText(/后重发/)).not.toBeInTheDocument()
    })

    it("发码失败的 toast 取 catalog 那句，不是后端 detail（§7.3 一条链）", async () => {
        await fillAndSendCode(
            failingSendCode({
                status: 429,
                code: "SMS_DAILY_LIMIT",
                detail: "后端这句话该进日志，不该弹给用户",
            }),
        )

        // 发码失败同时出现在两处：表单内联横幅（role=alert）与全局 toast（title 是 h2）。
        // 按角色取 toast 那一条证明 catalog 生效；整棵树都找不到 detail，等于两处都没漏后端句子
        expect(
            await screen.findByRole("heading", { name: "今日验证码已达上限" }),
        ).toBeInTheDocument()
        expect(screen.queryByText("后端这句话该进日志，不该弹给用户")).not.toBeInTheDocument()
    })
})
