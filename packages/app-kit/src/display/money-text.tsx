import type { Money } from "@shop/common/domain"
import { formatMoney } from "@shop/common/domain"
import { useI18n } from "../i18n"

/**
 * 金额文本：模块级表格 cell（不是组件、调不了 hook）里唯一正确的 formatMoney 用法（§3.5）。判据是「这处是不是组件」，是组件就直接 formatMoney(m, locale)。
 * 不给 locale 设默认值——等于把「不知道当前语言」放回来，英文界面会印成另一种写法而没人报错。
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
