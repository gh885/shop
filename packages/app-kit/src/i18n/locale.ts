import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale, type AppLocale } from "@shop/common"

/**
 * Locale 的浏览器管道：cookie 读写，以及「该用哪个 Locale」的回落顺序。
 *
 * 从 `provider.tsx` 抽出来的原因：这几段一行都不需要 React，原先却只能靠渲染 Provider 才碰得到；
 * 而回落顺序写错是静默的——界面照常显示，只是刷新后语言换了。SSR 阶段没有 document/navigator，
 * 读的一侧退化成「什么都读不到」（首屏因此沿用装配侧给的 initialLocale），写的一侧直接跳过。
 */

/** 读一条 cookie；没有则 undefined。写入时按 encodeURIComponent 存，所以取出要还原 */
export function readCookie(name: string): string | undefined {
    if (typeof document === "undefined") return undefined
    const prefix = `${name}=`
    const item = document.cookie.split("; ").find((row) => row.startsWith(prefix))
    return item ? decodeURIComponent(item.slice(prefix.length)) : undefined
}

/** 写一条 cookie：path=/ 让同站所有路径都带上，一年过期，SameSite=Lax */
export function writeCookie(name: string, value: string): void {
    if (typeof document === "undefined") return
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`
}

/**
 * 首屏 Locale：装配侧给了就照它渲染（与服务端 HTML 同值，不做二次猜测），没给就是平台默认。
 * 这里不再问「进程当前是什么语言」——那个可变量已删（§3.5），SSR 下它本来也不可信。
 */
export function initialLocaleOf(initialLocale?: AppLocale): AppLocale {
    return initialLocale ?? DEFAULT_LOCALE
}

/**
 * 挂载后重定语言时的回落顺序：已存的 cookie → 浏览器语言 → 平台默认。
 * 三条候选一起交给 resolveLocale：cookie 里可能是 `zh_CN`、navigator.language 可能是 `zh-Hans-CN`，
 * 归一与「不支持就往下走一级」都由它负责，不在这里各判一遍（最后一档是它的返回值，不是候选）。
 */
export function readPreferredLocale(): AppLocale {
    return resolveLocale([
        readCookie(LOCALE_COOKIE_NAME),
        typeof navigator === "undefined" ? undefined : navigator.language,
    ])
}

/** 把当前 Locale 落回 locale cookie：Locale 一改就同步，别让 cookie 与界面各说一种语言 */
export function writeLocaleCookie(locale: AppLocale): void {
    writeCookie(LOCALE_COOKIE_NAME, locale)
}
