import { localeOf, type I18nInstance } from "@shop/i18n"

/** 浏览器文档语言在 languageChanged 中同步更新；组件不再通过 effect 复制语言状态。 */
export function bindBrowserI18n(i18n: I18nInstance): () => void {
    if (typeof document === "undefined") return () => {}
    const sync = () => {
        const locale = localeOf(i18n)
        document.documentElement.lang = locale
    }
    sync()
    i18n.on("languageChanged", sync)
    return () => {
        i18n.off("languageChanged", sync)
    }
}
