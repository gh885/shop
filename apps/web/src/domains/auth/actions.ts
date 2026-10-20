import { AuthApi } from "@shop/api/sdk"

import { getDeviceId, tokenStore } from "#/shared/api/auth"

export async function loginBySms(phone: string, code: string): Promise<void> {
    const { accessToken } = await AuthApi.loginBySms({
        body: { phone, code, deviceId: getDeviceId() },
    })
    if (!accessToken) throw new Error("登录失败")
    tokenStore.set(accessToken)
}

export async function loginByPassword(phone: string, password: string): Promise<void> {
    const { accessToken } = await AuthApi.loginByPassword({
        body: { phone, password, deviceId: getDeviceId() },
    })
    if (!accessToken) throw new Error("登录失败")
    tokenStore.set(accessToken)
}

export async function sendSmsCode(
    phone: string,
    captcha: { captchaId: string; captchaCode: string },
): Promise<void> {
    await AuthApi.sendSmsCode({
        body: { phone, captchaId: captcha.captchaId, captchaCode: captcha.captchaCode },
    })
}

export async function logout(): Promise<void> {
    try {
        await AuthApi.logout({ body: { deviceId: getDeviceId() } })
    } catch {
    } finally {
        tokenStore.clear()
    }
}

export const getCaptcha = () => AuthApi.getCaptcha()
