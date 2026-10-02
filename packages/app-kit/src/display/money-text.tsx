import type { Money } from "@shop/common/domain"
import { formatMoney } from "@shop/common/domain"
import { useI18n } from "../i18n"

/**
 * 金额文本：模块级表格列定义里唯一正确的 `formatMoney` 用法（§3.5 约束 2 的「拿不到 hook 的位置」）。
 *
 * 与 `TimeText` 同一个道理：`ColumnDef[].cell` 不是组件，既调不了 hook、
 * 也没有参数可传（admin/seller 的表格列都是模块级数组）。两种绕法都试过：
 * 读 `localeScope.locale` —— 切语言时不保证重渲染；组件化渲染 —— `useI18n()` 就是订阅，
 * 切语言必然重画。
 *
 * **为什么这里也需要一个组件**（而不是给 `formatMoney` 的 `locale` 一个默认值）：默认值等于把
 * 「不知道当前什么语言」这个状态放回来，金额在英文界面就会印成另一种写法而没人报错。
 *
 * 组件里（seller/web 的 JSX）直接 `formatMoney(m, locale)`，那儿 hook 拿得到。
 * 判据是「这处是不是组件」，不是「哪个顺手」。
 */
export function MoneyText({
    value,
    placeholder,
}: {
    value: Money | null | undefined
    /** 缺席时的占位（未定价 / 未退成…）。不给则用 `formatMoney` 的默认「—」 */
    placeholder?: string
}) {
    const { locale } = useI18n()
    return formatMoney(value, locale, placeholder)
}
