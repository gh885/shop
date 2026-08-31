import { unwrap } from "@shop/api"
import { AuthApi } from "@shop/api/sdk"

import { getDeviceId, tokenStore } from "#/shared/api/auth"

/**
 * 登录/认证动作（纯逻辑命令，非 hook、非组件）。
 * 登录成功/登出后对 tokenStore 的写入集中在这层，组件只管调动作。
 * 生成 SDK 返回 { data, error } 不抛错——unwrap 把 error 抛成异常，供调用方 catch 归一化。
 */

/** 登录（短信验证码）：成功后写入 access token */
export async function loginBySms(phone: string, code: string): Promise<void> {
    const { accessToken } = unwrap(
        await AuthApi.loginBySms({ body: { phone, code, deviceId: getDeviceId() } }),
    )
    if (!accessToken) throw new Error("登录失败")
    tokenStore.set(accessToken)
}

/** 登录（密码）：成功后写入 access token */
export async function loginByPassword(phone: string, password: string): Promise<void> {
    const { accessToken } = unwrap(
        await AuthApi.loginByPassword({ body: { phone, password, deviceId: getDeviceId() } }),
    )
    if (!accessToken) throw new Error("登录失败")
    tokenStore.set(accessToken)
}

/** 发送短信验证码（需先过图形验证码，captchaId + captchaCode 一起上报） */
export async function sendSmsCode(
    phone: string,
    captcha: { captchaId: string; captchaCode: string },
): Promise<void> {
    unwrap(
        await AuthApi.sendSmsCode({
            body: { phone, captchaId: captcha.captchaId, captchaCode: captcha.captchaCode },
        }),
    )
}

/** 登出：接口失败也强制清本地状态 */
export async function logout(): Promise<void> {
    try {
        unwrap(await AuthApi.logout({ body: { deviceId: getDeviceId() } }))
    } catch {
        // 登出接口失败也强制清本地状态
    } finally {
        tokenStore.clear()
    }
}

/** 图形验证码：SDK 返回 { captchaId, image }，供 useCaptcha 使用（匿名公开接口） */
export async function getCaptcha(): Promise<{ captchaId: string; image: string }> {
    const data = unwrap(await AuthApi.getCaptcha())
    return { captchaId: data.captchaId ?? "", image: data.image ?? "" }
}
