import { PLATFORM_TIME_ZONE } from "@shop/i18n"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/client"
import { AuthApi, SubaccountAuthApi } from "@shop/api/sdk"

import { getCurrentShopId, setCurrentShopId } from "./shop-store"
import { appI18n } from "./i18n"
import { localeOf } from "@shop/i18n"
import { clearSessionKind, isSubaccountSession } from "./session-kind"

// refresh 里的会话种类必须每次调用时求值，不能装配时定死：同一标签页先店主、登出后子账号是常态
const authKit = createAuthKit({
    refresh: async (deviceId) => {
        const res = isSubaccountSession()
            ? await SubaccountAuthApi.refreshSubaccountSession({ body: { deviceId } })
            : await AuthApi.refresh({ body: { deviceId } })
        if (!res.accessToken) throw new Error("refresh 失败")
        return { accessToken: res.accessToken }
    },
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus } = authKit

// X-Shop-Id 只在店主会话注入；子账号自带店铺，注入别家店会被后端 403
configureSdkClient("", tokenStore, {
    debug: import.meta.env.DEV,
    refreshPath: () => (isSubaccountSession() ? "auth/subaccount/refresh" : "auth/refresh"),
    contextHeaders: () => {
        const headers: Record<string, string | undefined> = {
            "Accept-Language": localeOf(appI18n),
            "X-Locale": localeOf(appI18n),
            "X-Timezone": PLATFORM_TIME_ZONE,
        }
        if (!isSubaccountSession()) headers["X-Shop-Id"] = getCurrentShopId()
        return headers
    },
})

export async function logout(): Promise<void> {
    try {
        if (isSubaccountSession()) {
            await SubaccountAuthApi.logoutSubaccount({ body: { deviceId: getDeviceId() } })
        } else {
            await AuthApi.logout({ body: { deviceId: getDeviceId() } })
        }
    } catch {
        // 登出接口失败也强制清本地状态，别因 catch 体为空就删掉这层 try
    } finally {
        tokenStore.clear()
        setCurrentShopId(undefined)
        // 留着「子账号」种类会让下一个店主登录页的静默刷新去打子账号刷新端点，用店主浏览器里那份子账号 cookie 换出令牌
        clearSessionKind()
    }
}

export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}
