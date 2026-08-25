import { createApiClient, createAuthApi, createAuthKit } from "@shop/api"

// 浏览器端走 Vite proxy（同源相对路径），见 vite.config.ts
export const authKit = createAuthKit({
    // 引用下方 authApi：调用发生在模块初始化后，安全
    refresh: (deviceId) => authApi.refresh({ deviceId }),
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus, useIsLoggedIn } =
    authKit

export const api = createApiClient("", tokenStore, { debug: import.meta.env.DEV })
export const authApi = createAuthApi(api.raw)
