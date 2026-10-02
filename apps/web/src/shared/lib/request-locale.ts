import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie, getRequest } from "@tanstack/react-start/server"

import { LOCALE_COOKIE_NAME, resolveLocale, type AppLocale } from "@shop/common/i18n"
import { pickHydrationLocale } from "@shop/app-kit/i18n"

/**
 * 首屏 Locale 的请求级解析（§3.5 约束 3 的第二档 / §9 P3′-a）。
 *
 * 取代的是「SSR 阶段没人写 localeScope、于是服务端恒按平台默认渲染、客户端挂载后再改 → 语言闪一下」
 * 那条老路。这里两端各走各的通道，返回值语义不同：
 * - **服务端**：从当前请求（AsyncLocalStorage 里的 `getRequest()`）读 cookie → `Accept-Language`，
 *   交给 `resolveLocale` 归一，最后一档落平台默认。请求级、并发各是各的，不会串语言。
 * - **客户端**：不自己解析——照抄服务端已渲染进 HTML 的 `<html lang>`（`pickHydrationLocale`），
 *   保证首屏两端同值、无 hydration mismatch；拿不到才返回 undefined，交回 Provider 的挂载后回落。
 *
 * 用 `createIsomorphicFn` 而非 `import.meta.env.SSR` 判断：它把 server 分支连同 `@tanstack/react-start/server`
 * 那批只在 Node 有请求上下文时才成立的调用，从客户端产物里整段摘掉。
 *
 * 两端都可能返回 undefined（客户端：`<html lang>` 缺失/非法；服务端：不在真实请求上下文里，见下）。
 * 调用方一律 `?? localeScope.locale` 兜底——那是装配处那个进程级实例，SSR 下没人写、恒为平台默认值。
 */
export const resolveRequestLocale = createIsomorphicFn()
    .server((): AppLocale | undefined => {
        // `getRequest()` 靠 Start 的 AsyncLocalStorage，只有在真实请求上下文里才拿得到。
        // 构建期按 SSR 变换执行、却没有服务端在跑的场景（单测、预热任务）会抛——那不是错误，
        // 只是「本就没有这一请求的语言可解析」，返回 undefined 交回调用方的 scope 回落。
        try {
            return resolveLocale([
                getCookie(LOCALE_COOKIE_NAME),
                getRequest().headers.get("accept-language"),
            ])
        } catch {
            return undefined
        }
    })
    .client((): AppLocale | undefined => pickHydrationLocale())
