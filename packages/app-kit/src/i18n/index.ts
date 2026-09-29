export {
    I18nProvider,
    I18nContext,
    type I18nContextValue,
    type I18nProviderProps,
} from "./provider"
/**
 * `useT` 只认 app-kit 自己那份 catalog（`appKit.*`）；三端的调用点要用**本端**的 key，
 * 得走各 app 的 `src/locales/use-t.ts`——那里是生成物 `XTranslate` 与调用点相接的地方（§5.5 契约 3）。
 */
export { useI18n, useT, useTypedT } from "./use-i18n"
export { LocaleSwitcher, type LocaleSwitcherProps } from "./locale-switcher"

export { DEFAULT_LOCALE, type AppLocale, type I18nResources } from "@shop/common"
export { APP_KIT_MESSAGES, translateAppKit } from "./messages"
export type { AppKitMessageKey, AppKitParamsOf, AppKitTranslate } from "../locales/messages.gen"
export { createLocaleScope, type LocaleScope } from "./scope"
export { assembleLocaleResources } from "./resources"
