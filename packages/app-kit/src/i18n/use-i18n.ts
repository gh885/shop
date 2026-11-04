import { useCallback, useContext, useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
    localeOf,
    normalizeLocale,
    SUPPORTED_LOCALES,
    translate,
    type MessageParams,
} from "@shop/i18n"

import { writeLocaleCookie } from "./locale"
import { LocalePreferenceContext } from "./locale-preference-context"

export function useI18n() {
    const { i18n } = useTranslation()
    const selectPreference = useContext(LocalePreferenceContext)?.selectLocale
    const locale = localeOf(i18n)
    const setLocale = useCallback(
        (next: string) => {
            const normalized = normalizeLocale(next)
            if (normalized) {
                writeLocaleCookie(normalized)
                void i18n.changeLanguage(normalized)
                selectPreference?.(normalized)
            }
        },
        [i18n, selectPreference],
    )
    const t = useCallback(
        (key: string, params?: MessageParams) => translate(i18n, key, params, locale),
        [i18n, locale],
    )
    return useMemo(
        () => ({ locale, availableLocales: SUPPORTED_LOCALES, setLocale, t }),
        [locale, setLocale, t],
    )
}
