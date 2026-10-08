import { useCallback, useMemo, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import {
    DataTableI18nProvider,
    FormErrorTranslateProvider,
    UiLabelsProvider,
    type FormErrorTranslator,
    type UiLabels,
} from "@shop/ui-web"
import type { I18nInstance, MessageParams } from "@shop/common/i18n"
import { buildDataTableI18n } from "./data-table-i18n"
import { useI18n } from "./use-i18n"

export interface I18nProviderProps {
    children: ReactNode
    i18n: I18nInstance
}

export function I18nProvider({ children, i18n }: I18nProviderProps) {
    return (
        <I18nextProvider i18n={i18n}>
            <UiTranslations>{children}</UiTranslations>
        </I18nextProvider>
    )
}

function isClientFieldError(error: unknown): error is { message: unknown; params?: MessageParams } {
    return typeof error === "object" && error !== null && "message" in error
}

/** UI 包仍只接收文案，不反向依赖翻译库和业务 catalog。 */
function UiTranslations({ children }: { children: ReactNode }) {
    const { t } = useI18n()
    const translateFieldError = useCallback<FormErrorTranslator>(
        (error) => {
            if (typeof error === "string") return error
            if (!isClientFieldError(error)) return ""
            return t(String(error.message), error.params)
        },
        [t],
    )
    const uiLabels = useMemo<UiLabels>(
        () => ({
            confirm: {
                cancel: t("confirm.cancel"),
                confirm: t("confirm.confirm"),
            },
            searchBar: {
                button: t("ui.search.button"),
                placeholder: t("ui.search.placeholder"),
                ariaLabel: t("ui.search.ariaLabel"),
            },
            stateError: {
                title: t("ui.stateError.title"),
                retry: t("ui.stateError.retry"),
                retrying: t("ui.stateError.retrying"),
            },
            imageUpload: {
                remove: t("ui.imageUpload.remove"),
                drag: t("ui.imageUpload.drag"),
                emptyAlt: t("ui.imageUpload.emptyAlt"),
                gridLabel: t("ui.imageUpload.gridLabel"),
                readError: t("ui.imageUpload.readError"),
                uploadError: t("ui.imageUpload.uploadError"),
            },
            regionPicker: {
                placeholder: t("ui.regionPicker.placeholder"),
                searchPlaceholder: t("ui.regionPicker.searchPlaceholder"),
            },
            phoneField: {
                ariaLabel: t("ui.phoneField.ariaLabel"),
                placeholder: t("ui.phoneField.placeholder"),
            },
            select: { placeholder: t("ui.select.placeholder") },
            dateTimePicker: {
                placeholder: t("ui.dateTimePicker.placeholder"),
                clear: t("ui.dateTimePicker.clear"),
                done: t("ui.dateTimePicker.done"),
                timeAria: (label) => t("ui.dateTimePicker.timeAria", { label }),
            },
            maskedValue: {
                view: t("ui.maskedValue.view"),
                ariaFor: (subject, value) =>
                    subject
                        ? t("ui.maskedValue.aria", { subject, value })
                        : t("ui.maskedValue.ariaNoSubject", { value }),
            },
        }),
        [t],
    )

    const dataTableI18n = useMemo(() => buildDataTableI18n(t), [t])
    return (
        <DataTableI18nProvider value={dataTableI18n}>
            <FormErrorTranslateProvider value={translateFieldError}>
                <UiLabelsProvider value={uiLabels}>{children}</UiLabelsProvider>
            </FormErrorTranslateProvider>
        </DataTableI18nProvider>
    )
}
