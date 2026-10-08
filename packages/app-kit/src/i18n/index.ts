export { I18nProvider, type I18nProviderProps } from "./provider"
/**
 * `useT` 只认 app-kit 自己那份 catalog（共享资源）；三端的调用点要用**本端**的 key，
 * 得走各 app 的 `src/locales/use-t.ts`——那里是生成物 `XTranslate` 与调用点相接的地方。
 * 传一个 namespace（`useT("error")`）拿到的是收窄形态 `AppKitScopedT`，key 位只收那一个文件。
 */
export { useI18n, useT, useTypedT } from "./use-i18n"
export { LocaleSwitcher, type LocaleSwitcherProps } from "./locale-switcher"

export { DEFAULT_LOCALE, type AppLocale, type I18nResources } from "@shop/common/i18n"
export { APP_KIT_MESSAGES, translateAppKit } from "./messages"
export type {
    AppKitMessageKey,
    AppKitNamespace,
    AppKitParamsOf,
    AppKitParamsByKey,
    AppKitScopedT,
    AppKitTranslate,
} from "../locales/messages.gen"
export { createAppI18n } from "./runtime"
export { bindBrowserI18n } from "./browser"
export { localeOf, type I18nInstance } from "@shop/common/i18n"
/** 水合继承：客户端首屏 Locale 照抄服务端渲染的 `<html lang>`，治 hydration mismatch */
export { pickHydrationLocale, readPreferredLocale } from "./locale"
export { assembleLocaleResources } from "./resources"
/** code → catalog key（「后端出 code，前端出文案」的类型侧保证；缺文案编译期就拦） */
export { type ErrorTextSource, errorKeyFor, errorText, errorTextPlan } from "./error-keys"
/** 状态选项在渲染边界把 labelKey 换成句子（配合 common 的 statusOptionsFromKeys） */
export { localizeStatusOptions } from "./localize-options"

export { appKitMessage } from "./message"
