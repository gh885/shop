import { PLATFORM_TIME_ZONE } from "@shop/i18n"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/client"
import { AdminAuthApi } from "@shop/api/sdk"

import { appI18n } from "./i18n"
import { localeOf } from "@shop/i18n"

const authKit = createAuthKit({
    deviceKey: "shop_admin_device_id",
    refresh: async () => {
        const res = await AdminAuthApi.refreshStaffSession()
        if (!res.accessToken) throw new Error("refresh 失败")
        return { accessToken: res.accessToken }
    },
})
export const { tokenStore, getDeviceId, useAuthStatus } = authKit
const { authState, bootstrapAuth } = authKit

configureSdkClient("", tokenStore, {
    refreshPath: "admin/auth/refresh",
    debug: import.meta.env.DEV,
    contextHeaders: () => ({
        "Accept-Language": localeOf(appI18n),
        "X-Locale": localeOf(appI18n),
        // 出站时区恒为平台时区（与 seller 同口径），不是用户所在时区
        "X-Timezone": PLATFORM_TIME_ZONE,
    }),
})

export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}

export async function requireGuest(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() === "authed") {
        throw redirect({ to: "/", search: { page: 1, size: 20 } })
    }
}
