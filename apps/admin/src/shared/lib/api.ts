import { PLATFORM_TIME_ZONE } from "@shop/i18n"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/client"
import { AdminAuthApi } from "@shop/api/sdk"

import { appI18n } from "./i18n"
import { localeOf } from "@shop/i18n"

// admin 专属装配：staff 账号体系与 C 端隔离，刷新端点走 /admin/auth/refresh（cookie）。
// 业务方法一律由调用点直调生成 SDK（@shop/api/sdk）：这里只留装配与守卫，不再套一层同名转接。
const authKit = createAuthKit({
    deviceKey: "shop_admin_device_id",
    // 引用下方 AdminAuthApi：调用发生在模块初始化后，安全
    // SDK 出错即 throw（responseStyle: data + throwOnError），失败由 createAuthKit 裁决为 guest
    refresh: async () => {
        const res = await AdminAuthApi.refreshStaffSession()
        if (!res.accessToken) throw new Error("refresh 失败")
        return { accessToken: res.accessToken }
    },
})
export const { tokenStore, getDeviceId, useAuthStatus } = authKit
const { authState, bootstrapAuth } = authKit

// 生成 SDK 的默认 client：同源 + 同一套 token / 401 刷新拦截（刷新端点 admin 侧不同）
configureSdkClient("", tokenStore, {
    refreshPath: "admin/auth/refresh",
    debug: import.meta.env.DEV,
    contextHeaders: () => ({
        "Accept-Language": localeOf(appI18n),
        "X-Locale": localeOf(appI18n),
        // 与 seller 同一口径的出站时区：一期恒为平台时区，作用是让服务端
        // LocaleFilter 的时区维度可核对、可日志；用户所在时区那套另算
        "X-Timezone": PLATFORM_TIME_ZONE,
    }),
})

// 路由守卫
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
