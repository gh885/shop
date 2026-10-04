import { localeOf, type I18nInstance } from "@shop/common/i18n"
import { writeLocaleCookie } from "./locale"

/** 浏览器输出在 languageChanged 中同步写；组件不再通过 effect 复制语言状态。 */
export function bindBrowserI18n(i18n: I18nInstance): () => void {
    if (typeof document === "undefined") return () => {}
    const sync = () => {
        const locale = localeOf(i18n)
        writeLocaleCookie(locale)
        document.documentElement.lang = locale
    }
    sync()
    i18n.on("languageChanged", sync)
    return () => {
        i18n.off("languageChanged", sync)
    }
}
