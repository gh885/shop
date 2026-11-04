import { createI18n, translate, type I18nResources } from "./message"
import type { AppLocale } from "./locale"
import { assembleLocaleResources } from "./resources"
import type { SharedCatalog, SharedMessageKey, SharedParamsOf } from "./locales/messages.gen"

const localeFiles = import.meta.glob<SharedCatalog>("./locales/*/*.json", {
    eager: true,
    import: "default",
})

export const SHARED_MESSAGES: I18nResources = assembleLocaleResources(localeFiles)

// 此实例只做显式语言的纯翻译，不调用 changeLanguage，不持有用户状态。
const messages = createI18n({}, undefined, SHARED_MESSAGES)
export function translateShared<K extends SharedMessageKey>(
    key: K,
    locale: AppLocale,
    ...args: SharedParamsOf<K> extends undefined ? [] : [params: SharedParamsOf<K>]
): string {
    return translate(messages, key, args[0], locale)
}
