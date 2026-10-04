import type { AnyRouter } from "@tanstack/react-router"
import { localeOf, type I18nInstance } from "@shop/common/i18n"
import { reportError } from "#/shared/lib/report-error"

/** Router 的 context 是快照：语言事件同步更新它，再重算当前路由的 head。 */
export function bindRouterI18n(router: AnyRouter, i18n: I18nInstance): () => void {
    const sync = () => {
        router.update({ context: { ...router.options.context, locale: localeOf(i18n) } })
        void router.invalidate().catch(reportError)
    }
    i18n.on("languageChanged", sync)
    return () => {
        i18n.off("languageChanged", sync)
    }
}
