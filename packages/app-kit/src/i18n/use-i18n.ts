import { useCallback, useContext, useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
    localeOf,
    normalizeLocale,
    SUPPORTED_LOCALES,
    translate,
    type MessageParams,
} from "@shop/i18n"
import type { AppKitNamespace, AppKitScopedT, AppKitTranslate } from "../locales/messages.gen"

import { writeLocaleCookie } from "./locale"
import { LocalePreferenceContext } from "./locale-preference-context"

type TranslateShape = (...args: never[]) => string

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

export function useT(): AppKitTranslate
export function useT<N extends keyof AppKitNamespace>(namespace: N): AppKitScopedT<N>
export function useT(namespace?: keyof AppKitNamespace): AppKitTranslate {
    void namespace
    return useTypedT<AppKitTranslate>()
}

// T 只出现在返回位、由调用方显式指定（三端把本端生成 catalog 的翻译器类型接进来）——
// 这是刻意的「类型注入」工厂，不是可推断的泛型
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- 见上
export function useTypedT<T extends TranslateShape>(): T {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 本端生成类型限定资源 key 与 ICU 参数，运行时由同一 i18next 实例解析
    return useI18n().t as unknown as T
}
