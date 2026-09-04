import { AuthApi } from "@shop/api/sdk"

// ---------- 认证域数据函数（直接在调用点用，不经集中封装对象） ----------

/** 当前登录用户信息 */
export async function me() {
    return await AuthApi.me()
}

/** 图形验证码（发码前先人机验证） */
export async function getCaptcha(): Promise<{ captchaId: string; image: string }> {
    const data = await AuthApi.getCaptcha()
    return { captchaId: data.captchaId, image: data.image }
}

/** 短信验证码登录 */
export async function loginBySms(input: { phone: string; code: string; deviceId: string }) {
    const data = await AuthApi.loginBySms({ body: input })
    return { accessToken: data.accessToken }
}

/** 密码登录 */
export async function loginByPassword(input: {
    phone: string
    password: string
    deviceId: string
}) {
    const data = await AuthApi.loginByPassword({ body: input })
    return { accessToken: data.accessToken }
}

/** 发送短信验证码 */
export async function sendSmsCode(input: {
    phone: string
    captchaId: string
    captchaCode: string
}) {
    await AuthApi.sendSmsCode({ body: input })
}
