import { redirect } from "@tanstack/react-router"

import { createAdminApi, createApiClient, createAuthKit } from "@shop/api"

// admin 专属装配：staff 账号体系与 C 端隔离，刷新端点走 admin/auth/refresh（cookie）。
// API 契约（schemas + endpoints）在 @shop/api 的 createAdminApi / schemas/admin。
export const authKit = createAuthKit({
    deviceKey: "shop_admin_device_id",
    // 引用下方 adminApi：调用发生在模块初始化后，安全
    refresh: (deviceId) => adminApi.refresh(deviceId),
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus } = authKit

export const api = createApiClient("", tokenStore, {
    refreshPath: "admin/auth/refresh",
    debug: import.meta.env.DEV,
})
export const adminApi = createAdminApi(api.raw)

// ---------- 路由守卫 ----------

/** 受保护路由：未登录跳登录页 */
export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}

/** 登录页专用：已登录跳回工作台 */
export async function requireGuest(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() === "authed") {
        throw redirect({ to: "/", search: { page: 1, size: 20 } })
    }
}
