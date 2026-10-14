import { createI18n, DEFAULT_LOCALE, type AppLocale, type I18nResources } from "@shop/i18n"
import { APP_KIT_MESSAGES } from "./messages"

/** 原生 i18next 持有语言；资源与语言在渲染前装配好。 */
export function createAppI18n(
    locale: AppLocale = DEFAULT_LOCALE,
    resources: I18nResources = APP_KIT_MESSAGES,
) {
    return createI18n(resources, locale, APP_KIT_MESSAGES)
}
