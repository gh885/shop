import { TZDate } from "@date-fns/tz"
import { format, isValid } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"

import type { AppLocale } from "@shop/common/i18n"
import { PLATFORM_TIME_ZONE } from "@shop/common/i18n"
import { translateAppKit } from "../i18n/messages"

/**
 * 时间格式化（三个 SPA 共用的展示约定，属于「应用层胶水」而非契约）：
 * 与 @shop/common 的金额格式化不同——fenToYuan 镜像 Money 契约形状所以归 common，
 * 日期格式是纯展示约定，归 app-kit。
 *
 * **全仓唯一的时间展示出口**。收敛到这里的理由不是「整洁」，是这条格式**曾经有两条**：
 * 一条在这里（date-fns，显式 locale + 图案 + 平台时区），一条在 `@shop/common/i18n` 的
 * `formatDate/formatDateTime`（Intl + 调用方传 options，且吃环境时区）。后者零生产调用方，
 * 却能被 import，于是「一个概念只有一个出口」在日期上是失效的而没人报——它已经删掉。
 * 数字格式化（`formatNumber`）也一并删了：零调用方，等真有非金额数字要用 `Intl.NumberFormat` 时
 * 随调用点一起回来（没有需求就不造这个抽象）。
 *
 * **时区显式钉 `Asia/Shanghai`，不吃环境默认**（`PLATFORM_TIME_ZONE`）：SSR 与 hydration 两侧、
 * 开发机与生产容器，必须按同一个时区算同一个 instant，否则跨零点的时刻在两边出不同日期。
 * 实测 `2026-03-01T17:30:00Z` 在 UTC 下是 3/1、在 +08 下是 3/2——这不是理论差异。
 * 实现靠 `TZDate`（`@date-fns/tz`）：date-fns 的每个函数都认日期对象自带的时区，
 * 所以图案与 locale 保持原样，只多一个「这个 instant 按哪个时区读」这一维。
 * `TZDate` 需要完整 ICU，Node 13+ 与现代浏览器都有；仓库本来就依赖 `Intl`（intl-messageformat）。
 *
 * **locale 必填**：这三个函数以前不问出处地读进程级当前语言，于是「展示用的语言」
 * 和「渲染这行的 Provider 用的语言」可以是两回事。现在每个调用点都要说清楚它按谁的语言排。
 * 组件里 `useI18n().locale`，表格 cell 这类拿不到 hook 的位置用 `<TimeText>`（内部就是同一件事）。
 *
 * 兜底约定：非法日期原样返回传入的字符串（`formatTimeShort` 除外——它用在次要时间列，给占位文案）。
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

/**
 * 三个格式共享的管道：解析 → 投到平台时区 → 按给定 Locale 格式化；
 * 解析不出来交回 undefined 由调用方兜底。
 *
 * `TZDate` 那一步是这条函数与「环境时区」唯一的分界：没有它，`format(date, …)` 读的是
 * 运行进程的本地时区（生产容器 UTC、开发机 +08、用户浏览器任意）。
 */
function formatIso(iso: string, locale: AppLocale, shape: keyof (typeof FORMATS)["zh-Hans-CN"]) {
    const date = new Date(iso)
    if (!isValid(date)) return undefined
    return format(new TZDate(date, PLATFORM_TIME_ZONE), FORMATS[locale][shape], {
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
    return formatIso(iso, locale, "timeShort") ?? translateAppKit("time.unknown", locale)
}
