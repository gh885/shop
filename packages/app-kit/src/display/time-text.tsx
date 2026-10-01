import { formatDate, formatDateTime, formatTimeShort } from "./format"
import { useI18n } from "../i18n"

/**
 * 时间文本：模块级表格列定义里唯一正确的 `format*` 用法（§3.5 约束 2 的「拿不到 hook 的位置」）。
 *
 * 为什么不是直接调 `formatDateTime(iso, locale)`：admin 的列定义是模块级数组，`cell` 不是组件，
 * 那里既调不了 hook，也没有参数可传。两种写法都试过，取这一种：
 * - 读装配注入的 `localeScope.locale` —— 切语言时**不保证重渲染**：没订阅 I18nContext 的表格
 *   会把旧语言的日期一直挂着，直到别的原因让它重画；
 * - 渲染成本组件 —— `useI18n()` 就是订阅，切语言必然重画，与组件内调用同语义。
 *
 * 组件里（seller/web 的 JSX）仍直接 `formatDateTime(iso, locale)`：那儿 hook 拿得到，多包一层
 * 组件反而把文本拆成独立节点。两种写法的判据是「这处是不是组件」，不是「哪个顺手」。
 */
export function TimeText({
    iso,
    shape = "dateTime",
}: {
    iso: string
    /** 与 `format*` 三件套同名：完整日期时间 / 仅日期 / 短时间（月日时分） */
    shape?: "dateTime" | "date" | "timeShort"
}) {
    const { locale } = useI18n()
    if (shape === "date") return formatDate(iso, locale)
    if (shape === "timeShort") return formatTimeShort(iso, locale)
    return formatDateTime(iso, locale)
}
