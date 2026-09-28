import { format, isValid } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"

import { getCurrentLocale } from "@shop/common"

import { translateAppKit } from "./i18n/messages"

/**
 * 时间格式化（三个 SPA 共用的展示约定，属于「应用层胶水」而非契约）：
 * 与 @shop/common 的金额格式化不同——fenToYuan 镜像 Money 契约形状所以归 common，
 * 日期格式是纯展示约定，归 app-kit。
 *
 * 兜底约定：非法日期原样返回传入的字符串（`formatTimeShort` 除外——它用在次要时间列，给占位文案）。
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

/** 三个格式共享的管道：取当前 Locale → 解析 → 格式化；解析不出来交回 undefined 由调用方兜底 */
function formatIso(iso: string, shape: keyof (typeof FORMATS)["zh-CN"]): string | undefined {
    const date = new Date(iso)
    if (!isValid(date)) return undefined
    const locale = localeOf()
    return format(date, FORMATS[locale][shape], {
        locale: locale === "en-US" ? enUS : zhCN,
    })
}

/** ISO 时间 → 当前 Locale 的日期时间 */
export function formatDateTime(iso: string): string {
    return formatIso(iso, "dateTime") ?? iso
}

/** ISO 时间 → 当前 Locale 的日期 */
export function formatDate(iso: string): string {
    return formatIso(iso, "date") ?? iso
}

/** ISO 时间 → 当前 Locale 的短时间（登录设备/最近操作等次要时间用） */
export function formatTimeShort(iso: string): string {
    return formatIso(iso, "timeShort") ?? translateAppKit("appKit.time.unknown")
}
