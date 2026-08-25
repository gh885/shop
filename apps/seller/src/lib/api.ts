import { redirect } from "@tanstack/react-router"

import {
    createApiClient,
    createAuthApi,
    createAuthKit,
    createProductApi,
    createShopApi,
} from "@shop/api"

// 浏览器端走 Vite proxy（同源相对路径），见 vite.config.ts
export const authKit = createAuthKit({
    // 引用下方 authApi：调用发生在模块初始化后，安全
    refresh: (deviceId) => authApi.refresh({ deviceId }),
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus, useIsLoggedIn } =
    authKit

export const api = createApiClient("", tokenStore, { debug: import.meta.env.DEV })
export const authApi = createAuthApi(api.raw)
export const shopApi = createShopApi(api.raw)
export const productApi = createProductApi(api.raw)

// ---------- 登出 ----------

export async function logout(): Promise<void> {
    try {
        await authApi.logout({ deviceId: getDeviceId() })
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
