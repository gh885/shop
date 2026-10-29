import { PLATFORM_TIME_ZONE } from "@shop/i18n"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/client"
import { SellerLoginControllerApi } from "@shop/api/sdk"

import { appI18n } from "./i18n"
import { localeOf } from "@shop/i18n"

const authKit = createAuthKit({
    deviceKey: "shop_seller_device_id",
    refresh: async () => {
        const res = await SellerLoginControllerApi.sellerRefresh({
            body: { deviceId: authKit.getDeviceId() },
        })
        if (!res.accessToken) throw new Error("refresh 失败")
        return { accessToken: res.accessToken }
    },
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus } = authKit

configureSdkClient("", tokenStore, {
    refreshPath: "api/seller/refresh",
    debug: import.meta.env.DEV,
    contextHeaders: () => ({
        "Accept-Language": localeOf(appI18n),
        "X-Locale": localeOf(appI18n),
        // 出站时区恒为平台时区（与 admin 同口径），不是用户所在时区
        "X-Timezone": PLATFORM_TIME_ZONE,
    }),
})

export async function logout(): Promise<void> {
    try {
        await SellerLoginControllerApi.sellerLogout({ body: { deviceId: getDeviceId() } })
    } catch {
        // 登出接口失败也强制清本地状态，别因 catch 体为空就删掉这层 try
    } finally {
        tokenStore.clear()
    }
}

export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}
