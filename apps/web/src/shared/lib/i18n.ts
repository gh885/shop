import {
    createAppI18n,
    bindBrowserI18n,
    pickHydrationLocale,
    readPreferredLocale,
    type I18nInstance,
} from "@shop/app-kit/i18n"
import { webMessages } from "#/locales"
import { parseLocalePath } from "./locale-url"
let browserI18n: I18nInstance | undefined
let unbind: (() => void) | undefined
export function getBrowserI18n(): I18nInstance {
    if (typeof document === "undefined") throw new Error("getBrowserI18n is browser-only")
    if (!browserI18n) {
        browserI18n = createAppI18n(
            parseLocalePath(window.location.pathname).locale ??
                pickHydrationLocale() ??
                readPreferredLocale(),
            webMessages,
        )
        unbind = bindBrowserI18n(browserI18n)
    }
    return browserI18n
}
if (import.meta.hot) import.meta.hot.dispose(() => unbind?.())
