import { PLATFORM_TIME_ZONE } from "@shop/common/i18n"
import { BACKEND_URL } from "#/shared/lib/env"
import { DEFAULT_LOCALE } from "@shop/common/i18n"
import { resolveRequestLocale } from "#/shared/lib/request-locale"
import { configureSdkClient, createSdkAuthKit } from "@shop/common/contract" // 浏览器端走 Vite proxy（同源相对路径）
// 本文件只做「依赖装配」，不对外暴露认证成员（tokenStore/bootstrapAuth/hooks 等）——
// 认证逻辑统一从 #/shared/api/auth 出，避免同一概念两个入口。
export const authKit = createSdkAuthKit()

const { tokenStore } = authKit

// 生成 SDK（@shop/api/sdk）的默认 client：同源 + 同一套 token/401 刷新拦截。
// 之后业务代码可直接调用 CartApi.getCartItems() 等具名方法。
// 浏览器端走 Vite proxy（同源相对路径）；SSR loader 在 Node 跑需要绝对地址，用 VITE_BACKEND_URL（生产必须显式配）
const baseUrl = import.meta.env.SSR ? BACKEND_URL : ""
configureSdkClient(baseUrl, tokenStore, {
    debug: import.meta.env.DEV,
    // SSR 按请求解析；浏览器从同一 i18next 实例读取，不能反向读取 HTML。
    contextHeaders: () => {
        const locale = resolveRequestLocale() ?? DEFAULT_LOCALE
        return {
            "Accept-Language": locale,
            "X-Locale": locale,
            // 出站时区：服务端 LocaleFilter 读它（i18n.md §7.2）。一期恒为平台时区——
            // SSR 渲染的日期已经按 PLATFORM_TIME_ZONE 排好（app-kit/display 的 TZDate），
            // 服务端若按另一个时区理解同一个 instant，「今天」就会与用户看到的不一致。
            "X-Timezone": PLATFORM_TIME_ZONE,
        }
    },
})
