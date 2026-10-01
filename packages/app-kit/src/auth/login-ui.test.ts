import { describe, expect, it } from "vite-plus/test"

import { ErrorCodes, type ApiError } from "@shop/common/contract"
import { CAPTCHA_CODE_DIGITS } from "./login-schema"
import {
    isCaptchaCodeComplete,
    isCaptchaError,
    isCodeError,
    isSmsRateLimit,
    loginUiReducer,
    type LoginUiState,
} from "./login-ui"

function apiError(status: number, code?: string): ApiError {
    return { status, detail: code ?? `HTTP ${status}`, code }
}

const INITIAL: LoginUiState = { tab: "sms", submitFailCount: 0 }

/**
 * 这套状态机决定的是「用户下一步看到什么」：错误清没清、抖没抖、焦点跳不跳。
 * 三条最容易被改错的地方：dismiss 只清自己那一类、发码失败不推进 failCount、
 * 提交成功把 failCount 留着（它只用于「刚失败过」这个信号）。
 */
describe("登录状态机", () => {
    it("重新输入图形验证码_只清图形码类错误，短信码错误留到下次提交", () => {
        const failed = loginUiReducer(INITIAL, {
            type: "submitFailed",
            error: apiError(400, ErrorCodes.CAPTCHA_INVALID),
        })
        expect(loginUiReducer(failed, { type: "dismissCaptchaError" }).submitError).toBeUndefined()

        const codeFailed = loginUiReducer(INITIAL, {
            type: "submitFailed",
            error: apiError(400, ErrorCodes.SMS_CODE_INVALID),
        })
        expect(loginUiReducer(codeFailed, { type: "dismissCaptchaError" }).submitError?.code).toBe(
            ErrorCodes.SMS_CODE_INVALID,
        )
    })

    it("重新输入短信验证码_停掉抖动，但图形码错误不被顺手清掉", () => {
        const codeFailed = loginUiReducer(INITIAL, {
            type: "submitFailed",
            error: apiError(400, ErrorCodes.SMS_CODE_EXPIRED),
        })
        expect(loginUiReducer(codeFailed, { type: "dismissCodeError" }).submitError).toBeUndefined()

        const captchaFailed = loginUiReducer(INITIAL, {
            type: "submitFailed",
            error: apiError(400, ErrorCodes.CAPTCHA_REQUIRED),
        })
        expect(loginUiReducer(captchaFailed, { type: "dismissCodeError" }).submitError?.code).toBe(
            ErrorCodes.CAPTCHA_REQUIRED,
        )
    })

    it("发码失败_报错但不推进 failCount：那不是提交失败，不该抢错误节点的焦点", () => {
        const next = loginUiReducer(INITIAL, {
            type: "sendCodeFailed",
            error: apiError(429, ErrorCodes.SMS_RATE_LIMIT),
        })
        expect([next.submitError?.status, next.submitFailCount]).toEqual([429, 0])
    })

    it("提交失败_留住错误并计数，计数是「该把焦点移过去」的信号", () => {
        const next = loginUiReducer(INITIAL, { type: "submitFailed", error: apiError(401) })
        expect([next.submitError?.status, next.submitFailCount]).toEqual([401, 1])
    })

    it("切 Tab_清掉服务端错误但保留失败次数：错误文案是上一个 Tab 的", () => {
        const failed = loginUiReducer(INITIAL, { type: "submitFailed", error: apiError(401) })
        const next = loginUiReducer(failed, { type: "switchTab", tab: "password" })
        expect([next.tab, next.submitError, next.submitFailCount]).toEqual([
            "password",
            undefined,
            1,
        ])
    })

    it("提交成功_回到短信 Tab 并清错误（下次打开弹窗该从默认页签看起）", () => {
        const passwordTab: LoginUiState = { tab: "password", submitFailCount: 2 }
        expect(loginUiReducer(passwordTab, { type: "submitSucceeded" })).toEqual({
            tab: "sms",
            submitFailCount: 2,
        })
    })
})

describe("错误分类", () => {
    it("验证码输错/过期算一类：它们都该让输入框抖起来", () => {
        expect(isCodeError(apiError(400, ErrorCodes.SMS_CODE_INVALID))).toBe(true)
        expect(isCodeError(apiError(400, ErrorCodes.SMS_CODE_EXPIRED))).toBe(true)
        expect(isCodeError(apiError(400, ErrorCodes.CAPTCHA_INVALID))).toBe(false)
        expect(isCodeError(undefined)).toBe(false)
    })

    it.each([ErrorCodes.CAPTCHA_REQUIRED, ErrorCodes.CAPTCHA_EXPIRED, ErrorCodes.CAPTCHA_INVALID])(
        "图形码 %s 算一类：发码失败后都要换图并让用户重输",
        (code) => {
            expect(isCaptchaError(apiError(400, code))).toBe(true)
        },
    )

    it("短信码错误不算图形码：换图对它是无效动作，该提示的是重输验证码", () => {
        expect(isCaptchaError(apiError(400, ErrorCodes.SMS_CODE_INVALID))).toBe(false)
    })

    it("限频要状态码与错误码同时命中：只按 429 判会把别的限频也起倒计时", () => {
        expect(isSmsRateLimit(apiError(429, ErrorCodes.SMS_RATE_LIMIT))).toBe(true)
        expect(isSmsRateLimit(apiError(429, ErrorCodes.CAPTCHA_INVALID))).toBe(false)
        expect(isSmsRateLimit(apiError(400, ErrorCodes.SMS_RATE_LIMIT))).toBe(false)
    })
})

describe("图形验证码是否输满", () => {
    it("判据跟 login-schema 的位数走：改码长时不必跟着改这里", () => {
        const digits = CAPTCHA_CODE_DIGITS
        expect(isCaptchaCodeComplete("A".repeat(digits))).toBe(true)
        expect(isCaptchaCodeComplete("A".repeat(digits - 1))).toBe(false)
        expect(isCaptchaCodeComplete("A".repeat(digits + 1))).toBe(false)
    })
})
