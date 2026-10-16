import { type ApiError, ErrorCodes } from "@shop/common/contract"
import { CAPTCHA_CODE_DIGITS } from "./login-schema"

/**
 * 登录表单交互状态机（无 React 的那一半，抽出来才能用 node 单测）：Tab 切换/错误清除/失败计数是纯函数，
 * 按 frontend.md「状态机等决策逻辑必测」不该住在拖 jsdom 的文件里。错误分类的判定用 ErrorCodes 语义，不是组件局部知识。
 */

/** 登录方式：双 Tab 共用一套表单值，提交时按 Tab 取 code 还是 password */
export type LoginTab = "sms" | "password"

/** 发码成功或被限频后本地起的倒计时（秒）：服务端限频窗口就是这个数 */
export const RESEND_COUNTDOWN_SECONDS = 60

/** 验证码类错误（输错/过期）：重新输入时自动清除并停掉抖动 */
export function isCodeError(e: ApiError | undefined): boolean {
    return e?.code === ErrorCodes.SMS_CODE_INVALID || e?.code === ErrorCodes.SMS_CODE_EXPIRED
}

/** 图形验证码类错误：发码失败后需刷新验证码图并让用户重输 */
export function isCaptchaError(e: ApiError | undefined): boolean {
    return (
        e?.code === ErrorCodes.CAPTCHA_REQUIRED ||
        e?.code === ErrorCodes.CAPTCHA_EXPIRED ||
        e?.code === ErrorCodes.CAPTCHA_INVALID
    )
}

/** 短信发码被限频：服务端窗口就是 60s，命中时本地同样起倒计时（连点只会再撞一次限流） */
export function isSmsRateLimit(e: ApiError): boolean {
    return e.status === 429 && e.code === ErrorCodes.SMS_RATE_LIMIT
}

/** 位数 owner 是 login-schema 的 CAPTCHA_CODE_DIGITS，不另写一个 4：换长码时这里若不跟着改，发码按钮会永远点不动且不报错 */
export function isCaptchaCodeComplete(captchaCode: string): boolean {
    return captchaCode.length === CAPTCHA_CODE_DIGITS
}

export interface LoginUiState {
    tab: LoginTab
    submitError?: ApiError
    submitFailCount: number
}

export type LoginUiAction =
    | { type: "switchTab"; tab: LoginTab }
    | { type: "submitStarted" }
    | { type: "submitFailed"; error: ApiError }
    | { type: "submitSucceeded" }
    | { type: "sendCodeFailed"; error: ApiError }
    | { type: "sendCodeSucceeded" }
    /** 重新输入图形验证码：只清验证码类错误，其余保留到下次提交 */
    | { type: "dismissCaptchaError" }
    /** 重新输入短信验证码：只清发码类错误（抖动随之消失） */
    | { type: "dismissCodeError" }

export function loginUiReducer(state: LoginUiState, action: LoginUiAction): LoginUiState {
    switch (action.type) {
        case "switchTab":
            return { ...state, tab: action.tab, submitError: undefined }
        case "submitStarted":
            return { ...state, submitError: undefined }
        case "submitFailed":
            return {
                ...state,
                submitError: action.error,
                submitFailCount: state.submitFailCount + 1,
            }
        case "submitSucceeded":
            return { tab: "sms", submitError: undefined, submitFailCount: state.submitFailCount }
        case "sendCodeFailed":
            // 发码失败不动 failCount：错误提示不触发「聚焦错误节点」的提交语义
            return { ...state, submitError: action.error }
        case "sendCodeSucceeded":
            return { ...state, submitError: undefined }
        case "dismissCaptchaError":
            return isCaptchaError(state.submitError) ? { ...state, submitError: undefined } : state
        case "dismissCodeError":
            return isCodeError(state.submitError) ? { ...state, submitError: undefined } : state
    }
}
