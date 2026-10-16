import { formatDate, formatDateTime, formatTimeShort } from "./format"
import { useI18n } from "../i18n"

/**
 * 时间文本：模块级表格 cell（不是组件、调不了 hook）里唯一正确的 format* 用法（§3.5）。用本组件是因为读 localeScope.locale 切语言不保证重渲染，而 useI18n() 是订阅必然重画。
 * 组件里就直接 formatDateTime(iso, locale)——判据是「这处是不是组件」，多包一层反而把文本拆成独立节点。
 */
export function TimeText({
    iso,
    shape = "dateTime",
}: {
    iso: string
    shape?: "dateTime" | "date" | "timeShort"
}) {
    const { locale } = useI18n()
    if (shape === "date") return formatDate(iso, locale)
    if (shape === "timeShort") return formatTimeShort(iso, locale)
    return formatDateTime(iso, locale)
}
