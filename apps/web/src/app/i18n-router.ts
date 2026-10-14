import type { AnyRouter } from "@tanstack/react-router"
import { localeOf, type I18nInstance } from "@shop/i18n"
import { createLocaleRewrite, localizePathname, parseLocalePath } from "#/shared/lib/locale-url"
import { reportError } from "#/shared/lib/report-error"

export function bindRouterI18n(router: AnyRouter, i18n: I18nInstance): () => void {
    const sync = () => {
        const locale = localeOf(i18n)
        router.update({
            context: { ...router.options.context, locale },
            rewrite: createLocaleRewrite(locale, router.origin),
        })
        const location = router.history.location
        const url = new URL(location.href, router.origin)
        if (parseLocalePath(url.pathname).locale === locale) return
        url.pathname = localizePathname(url.pathname, locale)
        router.history.replace(url.pathname + url.search + url.hash, location.state, {
            ignoreBlocker: true,
        })
        void router.invalidate().catch(reportError)
    }
    const unbindLocation = router.subscribe("onBeforeLoad", ({ toLocation }) => {
        const locale = parseLocalePath(
            new URL(toLocation.publicHref, router.origin).pathname,
        ).locale
        if (locale && locale !== localeOf(i18n)) void i18n.changeLanguage(locale).catch(reportError)
    })
    i18n.on("languageChanged", sync)
    return () => {
        unbindLocation()
        i18n.off("languageChanged", sync)
    }
}
