import { createContext, useCallback, useEffect, useMemo, useState } from "react"

import { configureConfirmLabels } from "@shop/ui-web"

import {
    SUPPORTED_LOCALES,
    formatDate as formatDatePure,
    formatDateTime as formatDateTimePure,
    formatMessage,
    formatNumber as formatNumberPure,
    normalizeLocale,
    resolveMessage,
    setCurrentLocale,
    type AppLocale,
    type I18nResources,
    type MessageParams,
} from "@shop/common"

import { initialLocaleOf, readPreferredLocale, writeLocaleCookie } from "./locale"
import { APP_KIT_MESSAGES } from "./messages"

export interface I18nContextValue {
    locale: AppLocale
    availableLocales: readonly AppLocale[]
    setLocale: (locale: string) => void
    t: (key: string, params?: MessageParams) => string
    formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
    formatDateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

export const I18nContext = createContext<I18nContextValue | undefined>(undefined)

export interface I18nProviderProps {
    children: React.ReactNode
    resources: I18nResources
    initialLocale?: AppLocale
}

export function I18nProvider({ children, resources, initialLocale }: I18nProviderProps) {
    const [locale, setLocaleState] = useState<AppLocale>(() => initialLocaleOf(initialLocale))

    // 首屏保持服务端默认值，挂载后再读 cookie/浏览器语言，避免 SSR hydration mismatch。
    useEffect(() => {
        if (initialLocale) return
        const preferred = readPreferredLocale()
        setLocaleState((current) => (current === preferred ? current : preferred))
    }, [initialLocale])

    useEffect(() => {
        setCurrentLocale(locale)
        writeLocaleCookie(locale)
        if (typeof document !== "undefined") {
            document.documentElement.lang = locale
        }
    }, [locale])

    const setLocale = useCallback((next: string) => {
        const normalized = normalizeLocale(next)
        if (normalized) setLocaleState(normalized)
    }, [])

    const t = useCallback(
        (key: string, params?: MessageParams) => {
            const template =
                resolveMessage(resources, key, locale) ??
                resolveMessage(APP_KIT_MESSAGES, key, locale)
            if (template === undefined) return key
            return formatMessage(template, params, locale)
        },
        [locale, resources],
    )

    useEffect(() => {
        configureConfirmLabels({
            cancel: t("appKit.confirm.cancel"),
            confirm: t("appKit.confirm.confirm"),
        })
    }, [t])

    const contextValue = useMemo<I18nContextValue>(
        () => ({
            locale,
            availableLocales: SUPPORTED_LOCALES,
            setLocale,
            t,
            formatDate: (value, options) => formatDatePure(value, locale, options),
            formatDateTime: (value, options) => formatDateTimePure(value, locale, options),
            formatNumber: (value, options) => formatNumberPure(value, locale, options),
        }),
        [locale, setLocale, t],
    )

    return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
}
