import { createContext, useContext } from "react"
import type { AppLocale } from "@shop/i18n"

interface LocalePreferenceState {
    selectLocale: (locale: AppLocale) => void
    failed: boolean
    pending: boolean
    retry: (() => void) | undefined
}

export const LocalePreferenceContext = createContext<LocalePreferenceState | undefined>(undefined)

export function useLocalePreferenceError(): boolean {
    return useContext(LocalePreferenceContext)?.failed ?? false
}
