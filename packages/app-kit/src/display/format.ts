import { format, isValid } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"

import type { AppLocale } from "@shop/common/i18n"
import { translateAppKit } from "../i18n/messages"

/**
 * 时间格式化（三个 SPA 共用的展示约定，属于「应用层胶水」而非契约）：
 * 与 @shop/common 的金额格式化不同——fenToYuan 镜像 Money 契约形状所以归 common，
 * 日期格式是纯展示约定，归 app-kit。
 *
 * **locale 必填**（§3.5 约束 2）：这三个函数以前不问出处地读进程级当前语言，于是「展示用的语言」
 * 和「渲染这行的 Provider 用的语言」可以是两回事。现在每个调用点都要说清楚它按谁的语言排。
 * 组件里 `useI18n().locale`，表格 cell 这类拿不到 hook 的位置用 `<TimeText>`（内部就是同一件事）。
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

/** 三个格式共享的管道：解析 → 按给定 Locale 格式化；解析不出来交回 undefined 由调用方兜底 */
function formatIso(iso: string, locale: AppLocale, shape: keyof (typeof FORMATS)["zh-CN"]) {
    const date = new Date(iso)
    if (!isValid(date)) return undefined
    return format(date, FORMATS[locale][shape], {
        locale: locale === "en-US" ? enUS : zhCN,
    })
}

/** ISO 时间 → 给定 Locale 的日期时间 */
export function formatDateTime(iso: string, locale: AppLocale): string {
    return formatIso(iso, locale, "dateTime") ?? iso
}

/** ISO 时间 → 给定 Locale 的日期 */
export function formatDate(iso: string, locale: AppLocale): string {
    return formatIso(iso, locale, "date") ?? iso
}

/** ISO 时间 → 给定 Locale 的短时间（登录设备/最近操作等次要时间用） */
export function formatTimeShort(iso: string, locale: AppLocale): string {
    return formatIso(iso, locale, "timeShort") ?? translateAppKit("appKit.time.unknown", locale)
}
