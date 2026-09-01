import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit, unwrap } from "@shop/api"
import { AuthApi } from "@shop/api/sdk"

// 浏览器端走 Vite proxy（同源相对路径），见 vite.config.ts
export const authKit = createAuthKit({
    // 引用下方 AuthApi：调用发生在模块初始化后，安全
    refresh: async (deviceId) => {
        const res = await AuthApi.refresh({ body: { deviceId } })
        const token = res.data?.accessToken
        if (!token) throw res.error ?? new Error("refresh 失败")
        return { accessToken: token }
    },
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus, useIsLoggedIn } =
    authKit

// 生成 SDK（@shop/api/sdk）默认 client：同源 + 同一套 token / 401 刷新拦截
configureSdkClient("", tokenStore, { debug: import.meta.env.DEV })

// ---------- 登出 ----------

export async function logout(): Promise<void> {
    try {
        unwrap(await AuthApi.logout({ body: { deviceId: getDeviceId() } }))
    } catch {
        // 登出接口失败也强制清本地状态
    } finally {
        tokenStore.clear()
    }
}

// ---------- 路由守卫 ----------

/** 受保护路由的 beforeLoad 守卫：确保登录态已裁决，未登录跳登录页 */
export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}
