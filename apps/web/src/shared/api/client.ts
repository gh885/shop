import { PLATFORM_TIME_ZONE } from "@shop/i18n"
import { BACKEND_URL } from "#/shared/lib/env"
import { DEFAULT_LOCALE } from "@shop/i18n"
import { resolveRequestLocale } from "#/shared/lib/request-locale"
import { configureSdkClient, createSdkAuthKit } from "@shop/client"

export const authKit = createSdkAuthKit()

const { tokenStore } = authKit

const baseUrl = import.meta.env.SSR ? BACKEND_URL : ""
configureSdkClient(baseUrl, tokenStore, {
    debug: import.meta.env.DEV,
    contextHeaders: () => {
        const locale = resolveRequestLocale() ?? DEFAULT_LOCALE
        return {
            "Accept-Language": locale,
            "X-Locale": locale,
            // 出站时区：服务端 LocaleFilter 读它。一期恒为平台时区——
            // SSR 渲染的日期已经按 PLATFORM_TIME_ZONE 排好（app-kit/display 的 TZDate），
            // 服务端若按另一个时区理解同一个 instant，「今天」就会与用户看到的不一致。
            "X-Timezone": PLATFORM_TIME_ZONE,
        }
    },
})
