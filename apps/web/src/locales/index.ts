import { assembleLocaleResources, createAppI18n, type I18nResources } from "@shop/app-kit/i18n"
import { DEFAULT_LOCALE, translate, type AppLocale } from "@shop/i18n"
import type { WebCatalog, WebMessageKey, WebParamsByKey } from "./messages.gen"
import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

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
              [K in AppKitMessageKey]: AppKitParamsOf<K> extends undefined ? K : never
          }[AppKitMessageKey],
    locale?: AppLocale,
): string {
    return translate(headMessages, key, {}, locale ?? DEFAULT_LOCALE)
}
