import { BuyerAuthControllerApi } from "@shop/api/sdk"

import { getDeviceId, tokenStore } from "#/shared/api/auth"

export async function loginBySms(phone: string, code: string): Promise<void> {
    const { accessToken } = await BuyerAuthControllerApi.loginBySms({
        body: { phone, code, deviceId: getDeviceId() },
    })
    if (!accessToken) throw new Error("登录失败")
    tokenStore.set(accessToken)
}

export async function loginByPassword(phone: string, password: string): Promise<void> {
    const { accessToken } = await BuyerAuthControllerApi.buyerLogin({
        body: { phone, password, deviceId: getDeviceId() },
    })
    if (!accessToken) throw new Error("登录失败")
    tokenStore.set(accessToken)
}

export async function sendSmsCode(
    phone: string,
    captcha: { captchaId: string; captchaCode: string },
): Promise<void> {
    await BuyerAuthControllerApi.sendSmsCode({
        body: { phone, captchaId: captcha.captchaId, captchaCode: captcha.captchaCode },
    })
}

export async function logout(): Promise<void> {
    try {
        await BuyerAuthControllerApi.buyerLogout({ body: { deviceId: getDeviceId() } })
    } catch {
    } finally {
        tokenStore.clear()
    }
}

export const getCaptcha = () => BuyerAuthControllerApi.captcha()
