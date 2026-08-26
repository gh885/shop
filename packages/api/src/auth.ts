import type { KyInstance } from "ky"

import {
    MeResponseSchema,
    TokenResultSchema,
    CaptchaResponseSchema,
    type MeResponse,
    type CaptchaResponse,
    type PasswordLoginRequest,
    type SmsCodeRequest,
    type SmsLoginRequest,
    type SetPasswordRequest,
    type ForgotPasswordRequest,
    type ResetPasswordRequest,
    type RefreshRequest,
    type LogoutRequest,
    type TokenResult,
} from "./schemas/auth"

export function createAuthApi(api: KyInstance) {
    return {
        /** 发放图形验证码（匿名） */
        async getCaptcha(): Promise<CaptchaResponse> {
            return CaptchaResponseSchema.parse(await api.get("auth/captcha").json())
        },

        /** 发送短信验证码 */
        async sendSmsCode(data: SmsCodeRequest): Promise<void> {
            await api.post("auth/sms-code", { json: data })
        },

        /** 短信验证码登录/注册 */
        async loginBySms(data: SmsLoginRequest): Promise<TokenResult> {
            return TokenResultSchema.parse(await api.post("auth/login/sms", { json: data }).json())
        },

        /** 密码登录 */
        async loginByPassword(data: PasswordLoginRequest): Promise<TokenResult> {
            return TokenResultSchema.parse(
                await api.post("auth/login/password", { json: data }).json(),
            )
        },

        /** 设置/修改密码 */
        async setPassword(data: SetPasswordRequest): Promise<void> {
            await api.post("auth/password", { json: data })
        },

        /** 发送重置密码验证码 */
        async forgotPassword(data: ForgotPasswordRequest): Promise<void> {
            await api.post("auth/forgot-password", { json: data })
        },

        /** 使用重置 Token 设置新密码 */
        async resetPassword(data: ResetPasswordRequest): Promise<void> {
            await api.post("auth/reset-password", { json: data })
        },

        /** 刷新双 Token */
        async refresh(data: RefreshRequest): Promise<TokenResult> {
            return TokenResultSchema.parse(await api.post("auth/refresh", { json: data }).json())
        },

        /** 当前登录用户信息 */
        async me(): Promise<MeResponse> {
            return MeResponseSchema.parse(await api.get("auth/me").json())
        },

        /** 登出 */
        async logout(data: LogoutRequest): Promise<void> {
            await api.post("auth/logout", { json: data })
        },
    }
}
