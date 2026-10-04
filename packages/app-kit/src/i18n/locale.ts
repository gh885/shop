import {
    LOCALE_COOKIE_NAME,
    normalizeLocale,
    resolveLocale,
    type AppLocale,
} from "@shop/common/i18n" /**
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

/**
 * 水合继承：客户端首次渲染时，从服务端**已经写进 HTML 的那个 `<html lang>`** 取回 Locale。
 *
 * 存在只为解决 SSR 的一条硬约束——客户端首屏 Locale 必须等于服务端首屏 Locale，否则 hydration
 * mismatch（语言闪一下、DOM 结构可能被 React 判为不一致）。服务端是 Locale 的唯一真相源（读
 * cookie/Accept-Language 解析并渲染进 `lang`），客户端不必再自己解析一遍：照抄 HTML 上的值即可。
 * 拿不到（纯客户端导航、`lang` 是未知值）返回 undefined，交回 `readPreferredLocale` 那条挂载后回落。
 */
export function pickHydrationLocale(): AppLocale | undefined {
    if (typeof document === "undefined") return undefined
    return normalizeLocale(document.documentElement.lang) ?? undefined
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
