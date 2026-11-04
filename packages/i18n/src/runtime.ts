import { DEFAULT_LOCALE, type AppLocale } from "./locale"
import { createI18n, type I18nResources } from "./message"
import { SHARED_MESSAGES } from "./messages"

/** 原生 i18next 持有语言；资源与语言在渲染前装配好。 */
export function createAppI18n(
    locale: AppLocale = DEFAULT_LOCALE,
    resources: I18nResources = SHARED_MESSAGES,
) {
    return createI18n(resources, locale, SHARED_MESSAGES)
}
