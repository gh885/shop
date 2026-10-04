import { createInstance, type i18n } from "i18next"
import ICU from "i18next-icu"
import { captureError, type ErrorName } from "../monitoring"
import {
    DEFAULT_LOCALE,
    FALLBACKS,
    SUPPORTED_LOCALES,
    normalizeLocale,
    type AppLocale,
} from "./locale"

export type I18nInstance = i18n
export type LocaleCatalog = Readonly<Record<string, string>>
export type I18nResources = Partial<Record<AppLocale, LocaleCatalog>>
export type MessageParams = Record<string, string | number | boolean | null | undefined>

/** 字典已随构建加载：同步初始化，SSR 每个请求各建实例，不调用默认全局实例。 */
export function createI18n(
    resources: I18nResources,
    locale: AppLocale = DEFAULT_LOCALE,
    shared: I18nResources = {},
): I18nInstance {
    const instance = createInstance()
    const reported = new Set<string>()
    const report = (kind: ErrorName, key: string) => {
        const id = kind + ":" + key
        if (reported.has(id)) return
        reported.add(id)
        captureError(kind, null, { message: key })
    }
    instance.use(
        new ICU({
            parseErrorHandler: (error, key) => {
                report(
                    "code" in error && error.code === "MISSING_VALUE"
                        ? "i18n_missing_param"
                        : "i18n_invalid_message",
                    key,
                )
                return key
            },
        }),
    )
    void instance.init({
        lng: locale,
        supportedLngs: [...SUPPORTED_LOCALES],
        fallbackLng: Object.fromEntries(
            SUPPORTED_LOCALES.map((lng) => [lng, FALLBACKS[lng] ? [FALLBACKS[lng]] : []]),
        ),
        load: "currentOnly",
        initAsync: false,
        resources: Object.fromEntries(
            SUPPORTED_LOCALES.map((lng) => [
                lng,
                { app: resources[lng] ?? {}, shared: shared[lng] ?? {} },
            ]),
        ),
        ns: ["app", "shared"],
        defaultNS: "app",
        fallbackNS: "shared",
        keySeparator: false,
        nsSeparator: false,
        returnNull: false,
        returnEmptyString: false,
        interpolation: { escapeValue: false },
        saveMissing: true,
        missingKeyHandler: (_languages, _namespace, key) => report("i18n_missing_key", key),
    })
    return instance
}

/** 外部库给 string；应用内部只允许登记过的语言。 */
export function localeOf(instance: I18nInstance): AppLocale {
    return normalizeLocale(instance.language) ?? DEFAULT_LOCALE
}

/** 显式 lng 不会修改实例，纯翻译可安全用于并发 SSR。 */
export function translate(
    instance: I18nInstance,
    key: string,
    params: MessageParams = {},
    locale: AppLocale = localeOf(instance),
): string {
    const values = Object.fromEntries(
        Object.entries(params).map(([name, value]) => [name, value ?? ""]),
    )
    return instance.t(key, { ...values, lng: locale })
}
