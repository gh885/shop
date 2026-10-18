import {
    createI18n,
    translate,
    type AppLocale,
    type I18nResources,
    type MessageFact,
} from "@shop/i18n"
import { assembleLocaleResources } from "./resources"
import type { AppKitCatalog, AppKitMessageKey, AppKitParamsOf } from "../locales/messages.gen"

const localeFiles = import.meta.glob<AppKitCatalog>("../locales/*/*.json", {
    eager: true,
    import: "default",
})

export const APP_KIT_MESSAGES: I18nResources = assembleLocaleResources(localeFiles)

// 此实例只做显式语言的纯翻译，不调用 changeLanguage，不持有用户状态。
const messages = createI18n(APP_KIT_MESSAGES)
export function translateAppKit<K extends AppKitMessageKey>(
    key: K,
    locale: AppLocale,
    ...args: AppKitParamsOf<K> extends undefined ? [] : [params: AppKitParamsOf<K>]
): string {
    return translate(messages, key, args[0], locale)
}

/**
 * 「已校验 fact → 句子」的出口（fact 形状见 message-fact.ts：渲染边界认形状不认生产方）。
 * key↔params 的关联由 appKitMessage 工厂在生产方保证；TS 无法对判别联合做关联调用
 * （correlated union），宽口只收口在这一处——fact 族的具名出口（如 couponRuleText）都走这里。
 */
export function translateAppKitFact(
    fact: MessageFact<AppKitMessageKey>,
    locale: AppLocale,
): string {
    return translate(messages, fact.message, fact.params, locale)
}
