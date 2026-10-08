import type { LocationRewrite } from "@tanstack/react-router"
import {
    isAppLocale,
    LOCALE_COOKIE_NAME,
    resolveLocale,
    SUPPORTED_LOCALES,
    type AppLocale,
} from "@shop/common/i18n"

export function parseLocalePath(pathname: string): {
    locale: AppLocale | undefined
    pathname: string
    invalid: boolean
} {
    const segment = pathname.split("/")[1] ?? ""
    const locale = isAppLocale(segment)
        ? segment
        : SUPPORTED_LOCALES.find((value) => value.toLowerCase() === segment.toLowerCase())
    if (locale) {
        const remaining = pathname.slice(segment.length + 1).replace(/^\/+/, "")
        return { locale, pathname: "/" + remaining, invalid: false }
    }
    return {
        locale: undefined,
        pathname,
        invalid: /^(?:[a-z]{2}(?:[-_][a-z0-9]+)*|[a-z]{3}[-_][a-z0-9]+(?:[-_][a-z0-9]+)*)$/i.test(
            segment,
        ),
    }
}

export function localizePathname(pathname: string, locale: AppLocale): string {
    const internal = parseLocalePath(pathname).pathname.replace(/^\/+/, "")
    return "/" + locale + "/" + internal
}

export function createLocaleRewrite(locale: AppLocale, origin: string): LocationRewrite {
    return {
        input: ({ url }) => {
            if (url.origin === origin) url.pathname = parseLocalePath(url.pathname).pathname
            return url
        },
        output: ({ url }) => {
            if (url.origin === origin && !parseLocalePath(url.pathname).invalid) {
                url.pathname = localizePathname(url.pathname, locale)
            }
            return url
        },
    }
}

export function resolveHttpLocale(request: Request): AppLocale {
    const urlLocale = parseLocalePath(new URL(request.url).pathname).locale
    const cookie = request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(LOCALE_COOKIE_NAME + "="))
    let saved: string | undefined
    try {
        saved =
            cookie === undefined
                ? undefined
                : decodeURIComponent(cookie.slice(LOCALE_COOKIE_NAME.length + 1))
    } catch {
        saved = undefined
    }
    return resolveLocale([urlLocale, saved, request.headers.get("accept-language")])
}
