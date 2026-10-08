import { createI18n, translate, type AppLocale, type I18nResources } from "@shop/common/i18n"
import { assembleLocaleResources } from "./resources"
import type { AppKitCatalog, AppKitMessageKey, AppKitParamsOf } from "../locales/messages.gen"

const localeFiles = import.meta.glob<AppKitCatalog>("../locales/*/*.json", {
    eager: true,
    import: "default",
})

export const APP_KIT_MESSAGES: I18nResources = assembleLocaleResources(localeFiles)

// 此实例只做显式语言的纯翻译，不调用 changeLanguage，不持有用户状态。
const messages = createI18n(APP_KIT_MESSAGES)
export function translateAppKit<K extends AppKitMessageKey>(
    key: K,
    locale: AppLocale,
    ...args: AppKitParamsOf<K> extends undefined ? [] : [params: AppKitParamsOf<K>]
): string {
    return translate(messages, key, args[0], locale)
}
