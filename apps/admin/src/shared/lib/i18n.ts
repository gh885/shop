import { createAppI18n, bindBrowserI18n, readPreferredLocale } from "@shop/app-kit/i18n"
import { adminMessages } from "#/locales"
export const appI18n = createAppI18n(readPreferredLocale(), adminMessages)
const unbind = bindBrowserI18n(appI18n)
if (import.meta.hot) import.meta.hot.dispose(unbind)
