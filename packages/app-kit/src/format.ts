import { format, isValid } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"

import { getCurrentLocale } from "@shop/common"

import { translateAppKit } from "./i18n/messages"

/**
 * 时间格式化（三个 SPA 共用的展示约定，属于「应用层胶水」而非契约）：
 * 与 @shop/common 的金额格式化不同——fenToYuan 镜像 Money 契约形状所以归 common，
 * 日期格式是纯展示约定，归 app-kit。非法日期原样返回 iso（与展示兜底约定一致）。
 */

const FORMATS = {
    "zh-CN": {
        date: "yyyy-MM-dd",
        dateTime: "yyyy-MM-dd HH:mm",
        timeShort: "MM-dd HH:mm",
    },
    "en-US": {
        date: "MMM d, yyyy",
        dateTime: "MMM d, yyyy, h:mm a",
        timeShort: "MMM d, HH:mm",
    },
} as const

function localeOf(): keyof typeof FORMATS {
    return getCurrentLocale()
}

/** ISO 时间 → 当前 Locale 的日期时间（非法日期原样返回，与展示兜底约定一致） */
export function formatDateTime(iso: string): string {
    const d = new Date(iso)
    const locale = localeOf()
    return isValid(d)
        ? format(d, FORMATS[locale].dateTime, { locale: locale === "en-US" ? enUS : zhCN })
        : iso
}

/** ISO 时间 → 当前 Locale 的日期 */
export function formatDate(iso: string): string {
    const d = new Date(iso)
    const locale = localeOf()
    return isValid(d)
        ? format(d, FORMATS[locale].date, { locale: locale === "en-US" ? enUS : zhCN })
        : iso
}

/** ISO 时间 → 当前 Locale 的短时间（非法/缺省显示占位文案，登录设备/最近操作等次要时间用） */
export function formatTimeShort(iso: string): string {
    const d = new Date(iso)
    const locale = localeOf()
    return isValid(d)
        ? format(d, FORMATS[locale].timeShort, { locale: locale === "en-US" ? enUS : zhCN })
        : translateAppKit("appKit.time.unknown")
}
