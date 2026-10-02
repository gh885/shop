import { createContext, useCallback, useEffect, useMemo, useState } from "react"

import {
    configureImageUploadLabels,
    configureMaskedValueLabels,
    configurePhoneFieldLabels,
    configureRegionPickerLabels,
    configureSearchBarLabels,
    configureSelectFieldLabels,
    configureStateErrorLabels,
    configureConfirmLabels,
    DataTableI18nProvider,
} from "@shop/ui-web"

import {
    SUPPORTED_LOCALES,
    formatDate as formatDatePure,
    formatDateTime as formatDateTimePure,
    formatMessage,
    formatNumber as formatNumberPure,
    isMessageValid,
    normalizeLocale,
    resolveMessage,
    type AppLocale,
    type I18nResources,
    type MessageParams,
} from "@shop/common/i18n"
import { captureError } from "@shop/common/monitoring"
import { initialLocaleOf, readPreferredLocale, writeLocaleCookie } from "./locale"
import { buildDataTableI18n } from "./data-table-i18n"
import { APP_KIT_MESSAGES } from "./messages"
import type { LocaleScope } from "./scope"

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
    /**
     * 装配时创建的 Locale 持有者实例。Provider 是唯一写入者，`configureSdkClient` 的请求头钩子、
     * `notify`、模块级表格列这类「拿不到 hook 的调用点」读它——§3.5 约束 3 的第二档。
     * 必填的理由：可选项会被忘记传，而忘了传的表现是请求头静默停在平台默认语言，不报错。
     */
    scope: LocaleScope
    initialLocale?: AppLocale
}

export function I18nProvider({ children, resources, scope, initialLocale }: I18nProviderProps) {
    const [locale, setLocaleState] = useState<AppLocale>(() => initialLocaleOf(initialLocale))

    // 首屏保持服务端默认值，挂载后再读 cookie/浏览器语言，避免 SSR hydration mismatch。
    useEffect(() => {
        if (initialLocale) return
        const preferred = readPreferredLocale()
        setLocaleState((current) => (current === preferred ? current : preferred))
    }, [initialLocale])

    useEffect(() => {
        // scope 与 cookie、<html lang> 一样是 locale 的**输出**，不是它的存储（§3.5 约束 4）：
        // 存储在这里那份 React state，非组件消费者拿到的只是这份输出。
        scope.set(locale)
        writeLocaleCookie(locale)
        if (typeof document !== "undefined") {
            document.documentElement.lang = locale
        }
    }, [locale, scope])

    const setLocale = useCallback((next: string) => {
        const normalized = normalizeLocale(next)
        if (normalized) setLocaleState(normalized)
    }, [])

    const t = useCallback(
        (key: string, params?: MessageParams) => {
            const template =
                resolveMessage(resources, key, locale) ??
                resolveMessage(APP_KIT_MESSAGES, key, locale)
            if (template === undefined || !isMessageValid(template, locale)) {
                // 缺 key 上报（i18n.md §5.1 定的）：降级回 key 本身不白屏是对的，但静默降级
                // 意味着「漏了一个 key」这件事只有本地看控制台才发现得了——而生产看不了。
                // 上报走监控单一出口（@shop/common 的 captureError）
                captureError("i18n_missing_key", null, { message: `缺少文案: ${key}` })
                return key
            }
            return formatMessage(template, params, locale)
        },
        [locale, resources],
    )

    useEffect(() => {
        // ui-web 是纯 UI 包，不能反向依赖任何 app 的 catalog；这些壳层组件的通用文案
        // （确认框/搜索框/错误态/图片上传/区划/手机号/下拉占位/脱敏查看）在这一处按当前语言注入，
        // 与 §6「组件内不出现用户可见的自然语言，需要文案就从 props 注入」对齐。切语言随 t() 重跑。
        configureConfirmLabels({
            cancel: t("appKit.confirm.cancel"),
            confirm: t("appKit.confirm.confirm"),
        })
        configureSearchBarLabels({
            button: t("appKit.ui.search.button"),
            placeholder: t("appKit.ui.search.placeholder"),
            ariaLabel: t("appKit.ui.search.ariaLabel"),
        })
        configureStateErrorLabels({
            title: t("appKit.ui.stateError.title"),
            retry: t("appKit.ui.stateError.retry"),
            retrying: t("appKit.ui.stateError.retrying"),
        })
        configureImageUploadLabels({
            remove: t("appKit.ui.imageUpload.remove"),
            drag: t("appKit.ui.imageUpload.drag"),
            emptyAlt: t("appKit.ui.imageUpload.emptyAlt"),
            gridLabel: t("appKit.ui.imageUpload.gridLabel"),
            readError: t("appKit.ui.imageUpload.readError"),
            uploadError: t("appKit.ui.imageUpload.uploadError"),
        })
        configureRegionPickerLabels({
            placeholder: t("appKit.ui.regionPicker.placeholder"),
            searchPlaceholder: t("appKit.ui.regionPicker.searchPlaceholder"),
        })
        configurePhoneFieldLabels({
            ariaLabel: t("appKit.ui.phoneField.ariaLabel"),
            placeholder: t("appKit.ui.phoneField.placeholder"),
        })
        configureSelectFieldLabels({
            placeholder: t("appKit.ui.select.placeholder"),
        })
        configureMaskedValueLabels({
            view: t("appKit.ui.maskedValue.view"),
            ariaFor: (subject, value) =>
                subject
                    ? t("appKit.ui.maskedValue.aria", { subject, value })
                    : t("appKit.ui.maskedValue.ariaNoSubject", { value }),
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

    // ui-web 的 DataGrid 文案：按当前语言装配，`t` 变则身份变，消费者切语言当场重渲染（无滞后）。
    const dataTableI18n = useMemo(() => buildDataTableI18n(t), [t])

    return (
        <I18nContext.Provider value={contextValue}>
            <DataTableI18nProvider value={dataTableI18n}>{children}</DataTableI18nProvider>
        </I18nContext.Provider>
    )
}
