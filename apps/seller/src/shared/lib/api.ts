import { PLATFORM_TIME_ZONE } from "@shop/common/i18n"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createSdkAuthKit } from "@shop/common/contract"
import { AuthApi } from "@shop/api/sdk"

import { getCurrentShopId, setCurrentShopId } from "./shop-store"
import { appI18n } from "./i18n"
import { localeOf } from "@shop/common/i18n"

// 浏览器端走 Vite proxy（同源相对路径）
const authKit = createSdkAuthKit()
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus } = authKit

// 生成 SDK（@shop/api/sdk）默认 client：同源 + 同一套 token / 401 刷新拦截；
// seller 端所有 /seller/** 请求由拦截自动注入 X-Shop-Id 当前店铺头（业务代码不再手动携带）
configureSdkClient("", tokenStore, {
    debug: import.meta.env.DEV,
    contextHeaders: () => ({
        "X-Shop-Id": getCurrentShopId(),
        "Accept-Language": localeOf(appI18n),
        "X-Locale": localeOf(appI18n),
        // 出站时区：服务端 LocaleFilter 读它（i18n.md §7.2）。一期三端都发平台时区
        // （用户所在时区那套是 i18n.md §5.6 的「时区业务规则」），所以它此刻不改变任何响应内容——
        // 发它是为了让「服务端按什么时区理解请求」在日志与未来的动态内容里可核对，而不是等
        // 真要做多时区时才发现这条头从没存在过。
        "X-Timezone": PLATFORM_TIME_ZONE,
    }),
})

// 登出
export async function logout(): Promise<void> {
    try {
        await AuthApi.logout({ body: { deviceId: getDeviceId() } })
    } catch {
        // 登出接口失败也强制清本地状态
    } finally {
        tokenStore.clear()
        // 当前店铺也属于登录态（ACC-80）：它持久在 localStorage 并由拦截器注入 X-Shop-Id，
        // 不清就是下一个用同一浏览器登录的账号替上一个人发请求（哪怕他不在那家店）
        setCurrentShopId(undefined)
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
