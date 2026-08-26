import { authApi } from "#/shared/api/client"
import { getDeviceId, tokenStore } from "#/shared/api/auth"

/**
 * session 动作（纯逻辑命令，非 hook、非组件）。
 * 登录成功/登出后对 tokenStore 的写入集中在这层，组件只管调动作。
 */

/** 登录（短信验证码）：成功后写入 access token */
export async function loginBySms(phone: string, code: string): Promise<void> {
    const result = await authApi.loginBySms({ phone, code, deviceId: getDeviceId() })
    tokenStore.set(result.accessToken)
}

/** 登录（密码）：成功后写入 access token */
export async function loginByPassword(phone: string, password: string): Promise<void> {
    const result = await authApi.loginByPassword({ phone, password, deviceId: getDeviceId() })
    tokenStore.set(result.accessToken)
}

/** 发送短信验证码（需先过图形验证码，captchaId + captchaCode 一起上报） */
export function sendSmsCode(phone: string, captcha: { captchaId: string; captchaCode: string }) {
    return authApi.sendSmsCode({ phone, ...captcha })
}

/** 登出：接口失败也强制清本地状态 */
export async function logout(): Promise<void> {
    try {
        await authApi.logout({ deviceId: getDeviceId() })
    } catch {
        // 登出接口失败也强制清本地状态
    } finally {
        tokenStore.clear()
    }
}

/** 当前登录用户信息 */
export function me() {
    return authApi.me()
}
