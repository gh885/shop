import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie, getRequest } from "@tanstack/react-start/server"

import { LOCALE_COOKIE_NAME, localeOf, resolveLocale, type AppLocale } from "@shop/common/i18n"
import { getBrowserI18n } from "./i18n"

export const resolveRequestLocale = createIsomorphicFn()
    .server((): AppLocale | undefined => {
        // `getRequest()` 靠 Start 的 AsyncLocalStorage，只有在真实请求上下文里才拿得到。
        // 构建期按 SSR 变换执行、却没有服务端在跑的场景（单测、预热任务）会抛——那不是错误，
        // 只是「本就没有这一请求的语言可解析」，返回 undefined，由调用方使用平台默认语言。
        try {
            return resolveLocale([
                getCookie(LOCALE_COOKIE_NAME),
                getRequest().headers.get("accept-language"),
            ])
        } catch {
            return undefined
        }
    })
    .client((): AppLocale | undefined => localeOf(getBrowserI18n()))
