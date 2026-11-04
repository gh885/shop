import { assembleLocaleResources, createAppI18n, type I18nResources } from "@shop/i18n"
import { DEFAULT_LOCALE, translate, type AppLocale } from "@shop/i18n"
import type { WebCatalog, WebMessageKey, WebParamsByKey } from "./messages.gen"
import type { SharedMessageKey, SharedParamsOf } from "@shop/i18n"

const localeFiles = import.meta.glob<WebCatalog>("./*/*.json", {
    eager: true,
    import: "default",
})

export const webMessages: I18nResources = assembleLocaleResources(localeFiles)

const headMessages = createAppI18n(DEFAULT_LOCALE, webMessages)

export function translateWeb(
    key:
        | Exclude<WebMessageKey, keyof WebParamsByKey>
        | {
              [K in SharedMessageKey]: SharedParamsOf<K> extends undefined ? K : never
          }[SharedMessageKey],
    locale?: AppLocale,
): string {
    return translate(headMessages, key, {}, locale ?? DEFAULT_LOCALE)
}
