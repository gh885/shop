import { PLATFORM_TIME_ZONE } from "@shop/common/i18n"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/common/contract"
import { AuthApi, SubaccountAuthApi } from "@shop/api/sdk"

import { getCurrentShopId, setCurrentShopId } from "./shop-store"
import { appI18n } from "./i18n"
import { localeOf } from "@shop/common/i18n"
import { clearSessionKind, isSubaccountSession } from "./session-kind"

// 浏览器端走 Vite proxy（同源相对路径）
/**
 * 登录态套件：`refresh` 按会话种类分流。
 *
 * 两种会话的 refresh cookie 是两份（`subaccount_refresh_token` vs 买家的那一份），端点也不同，
 * 所以刷新必须看 `getSessionKind()` —— 它在**每次调用时**求值而不是装配时定死：同一份装配
 * 先服务店主登录、登出后再服务子账号登录，是同一个标签页里的常态。
 */
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

// 生成 SDK（@shop/api/sdk）默认 client：同源 + 同一套 token / 401 刷新拦截；
// 店主会话下所有 /seller/** 请求由拦截自动注入 X-Shop-Id 当前店铺头（业务代码不再手动携带），
// 子账号会话不注入 —— 它自带店铺，后端对「带别家店 X-Shop-Id」的请求直接 403。
configureSdkClient("", tokenStore, {
    debug: import.meta.env.DEV,
    refreshPath: () => (isSubaccountSession() ? "auth/subaccount/refresh" : "auth/refresh"),
    contextHeaders: () => {
        const headers: Record<string, string | undefined> = {
            "Accept-Language": localeOf(appI18n),
            "X-Locale": localeOf(appI18n),
            // 出站时区：服务端 LocaleFilter 读它。一期三端都发平台时区
            // （按用户所在时区展示的策略另定），所以它此刻不改变任何响应内容——
            // 发它是为了让「服务端按什么时区理解请求」在日志与未来的动态内容里可核对，而不是等
            // 真要做多时区时才发现这条头从没存在过。
            "X-Timezone": PLATFORM_TIME_ZONE,
        }
        if (!isSubaccountSession()) headers["X-Shop-Id"] = getCurrentShopId()
        return headers
    },
})

// 登出
export async function logout(): Promise<void> {
    try {
        if (isSubaccountSession()) {
            await SubaccountAuthApi.logoutSubaccount({ body: { deviceId: getDeviceId() } })
        } else {
            await AuthApi.logout({ body: { deviceId: getDeviceId() } })
        }
    } catch {
        // 登出接口失败也强制清本地状态
    } finally {
        tokenStore.clear()
        // 当前店铺也属于登录态（ACC-80）：它持久在 localStorage 并由拦截器注入 X-Shop-Id，
        // 不清就是下一个用同一浏览器登录的账号替上一个人发请求（哪怕他不在那家店）
        setCurrentShopId(undefined)
        // 会话种类同理：留着「子账号」会让下一个店主登录页的静默刷新去打子账号的刷新端点，
        // 用店主浏览器里那份子账号 cookie 换出一个子账号令牌
        clearSessionKind()
    }
}

// 路由守卫
/** 受保护路由的 beforeLoad 守卫：确保登录态已裁决，未登录跳登录页 */
export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}
