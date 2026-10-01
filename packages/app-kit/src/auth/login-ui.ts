import { type ApiError, ErrorCodes } from "@shop/common/contract"
import { CAPTCHA_CODE_DIGITS } from "./login-schema"

/**
 * 登录表单的交互状态机 —— 无 React 的那一半，抽出来才能用 node 环境单测。
 *
 * 留在 `login-form.tsx` 的只有「读什么画什么」；Tab 切换、错误清除、失败计数这套联动
 * 是纯函数（同一 state + 同一 action 必得同一 state），按 frontend.md「必测：状态机等
 * 决策逻辑」的口径它不该住在要拖 jsdom 的文件里。
 *
 * 错误分类也在这里：验证码类与图形码类各自的下游行为不同（前者停抖动、后者换图），
 * 判定条件是 `ErrorCodes` 的语义而不是组件局部知识。
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

/**
 * 图形验证码是否输满。
 *
 * 位数 owner 是 `login-schema.ts` 的 `CAPTCHA_CODE_DIGITS`，这里不另写一个 4：
 * 换更长的人机码时输入框 `maxLength` 与 schema 的 `max` 会跟着改，唯独「发码按钮是否可用」
 * 会留在旧长度上——按钮永远点不动，且没有任何一处报错。
 */
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

/** Tab 切换/错误清除/提交失败是联动状态机，收进一个 reducer，避免多处 setState 各自为政 */
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
