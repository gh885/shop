import { LOCALE_COOKIE_NAME, normalizeLocale, resolveLocale, type AppLocale } from "@shop/i18n"
/** Locale 的浏览器管道（cookie 读写 + 回落顺序），纯无 React；SSR 阶段读侧退化、写侧跳过 */

/** 读一条 cookie；没有则 undefined。写入时按 encodeURIComponent 存，所以取出要还原 */
export function readCookie(name: string): string | undefined {
    if (typeof document === "undefined") return undefined
    const prefix = `${name}=`
    const item = document.cookie.split("; ").find((row) => row.startsWith(prefix))
    try {
        return item ? decodeURIComponent(item.slice(prefix.length)) : undefined
    } catch {
        return undefined
    }
}

/** 写一条 cookie：path=/ 让同站所有路径都带上，一年过期，SameSite=Lax */
export function writeCookie(name: string, value: string): void {
    if (typeof document === "undefined") return
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`
}

/** SSR 水合硬约束：客户端首屏 Locale 必须等于服务端（否则 hydration mismatch）；照抄 `<html lang>`，拿不到则 undefined 交回挂载后回落 */
export function pickHydrationLocale(): AppLocale | undefined {
    if (typeof document === "undefined") return undefined
    return normalizeLocale(document.documentElement.lang) ?? undefined
}

/** 挂载后回落顺序：cookie → 浏览器语言 → 平台默认，归一与降级由 resolveLocale 负责 */
export function readPreferredLocale(): AppLocale {
    return resolveLocale([
        readCookie(LOCALE_COOKIE_NAME),
        ...(typeof navigator === "undefined" ? [] : navigator.languages),
    ])
}

/** 保存用户显式选择的 Locale；自动解析和访问语言链接不调用 */
export function writeLocaleCookie(locale: AppLocale): void {
    writeCookie(LOCALE_COOKIE_NAME, locale)
}
