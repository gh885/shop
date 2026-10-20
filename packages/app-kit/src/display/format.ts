import { TZDate } from "@date-fns/tz"
import { format, isValid } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"

import type { AppLocale } from "@shop/i18n"
import { PLATFORM_TIME_ZONE } from "@shop/i18n"
import { translateAppKit } from "../i18n/messages"

/**
 * 时间格式化（三 SPA 共用展示约定，归 app-kit 非 common；全仓唯一出口，见「前端规范」）。
 * 时区显式钉 `PLATFORM_TIME_ZONE`（Asia/Shanghai）不吃环境默认，否则跨零点时刻在 SSR/hydration 两侧出不同日期；locale 必填（§3.5）；非法日期原样返回（formatTimeShort 给占位）。
 */

const FORMATS = {
    "zh-Hans-CN": {
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

/** 共享管道：解析→投平台时区→按 Locale 格式化，解析不出交 undefined 兜底；TZDate 那步是与「环境时区」唯一分界，去掉就读进程本地时区 */
function formatIso(iso: string, locale: AppLocale, shape: keyof (typeof FORMATS)["zh-Hans-CN"]) {
    const date = new Date(iso)
    if (!isValid(date)) return undefined
    return format(new TZDate(date, PLATFORM_TIME_ZONE), FORMATS[locale][shape], {
        locale: locale === "en-US" ? enUS : zhCN,
    })
}

export function formatDateTime(iso: string, locale: AppLocale): string {
    return formatIso(iso, locale, "dateTime") ?? iso
}

export function formatDate(iso: string, locale: AppLocale): string {
    return formatIso(iso, locale, "date") ?? iso
}

export function formatTimeShort(iso: string, locale: AppLocale): string {
    return formatIso(iso, locale, "timeShort") ?? translateAppKit("time.unknown", locale)
}
