import type { AppLocale } from "./locale"

export type DateInput = Date | string | number

function toDate(value: DateInput): Date | null {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(
    value: DateInput,
    locale: AppLocale,
    options?: Intl.DateTimeFormatOptions,
): string {
    const date = toDate(value)
    if (!date) return String(value)
    return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(date)
}

export function formatDateTime(
    value: DateInput,
    locale: AppLocale,
    options?: Intl.DateTimeFormatOptions,
): string {
    const date = toDate(value)
    if (!date) return String(value)
    return new Intl.DateTimeFormat(
        locale,
        options ?? { dateStyle: "medium", timeStyle: "short" },
    ).format(date)
}

export function formatNumber(
    value: number,
    locale: AppLocale,
    options?: Intl.NumberFormatOptions,
): string {
    return new Intl.NumberFormat(locale, options).format(value)
}
