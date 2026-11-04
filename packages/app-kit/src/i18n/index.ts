export { useLocalePreferenceError } from "./locale-preference-context"
export { AccountLocaleProvider } from "./account-locale-provider"
export { I18nProvider, type I18nProviderProps } from "./provider"
export { useI18n, useTypedT } from "./use-typed-t"
export { LocaleSwitcher, type LocaleSwitcherProps } from "./locale-switcher"

/** 水合继承：客户端首屏 Locale 照抄服务端渲染的 `<html lang>`，治 hydration mismatch */
export { pickHydrationLocale, readPreferredLocale } from "./locale"
export { bindBrowserI18n } from "./browser"
