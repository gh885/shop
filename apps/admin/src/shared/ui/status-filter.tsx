import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shop/ui-web"
import type { StatusOption } from "@shop/common/domain"
import { useT } from "#/locales/use-t"

/** Select 不接受空值，「不筛」用这个哨兵占位 */
const ALL = "all"

/**
 * 枚举筛选下拉。「全部」在这里折回 undefined，调用点拿到的只会是 options 里的值，
 * 直接写进 URL search——哨兵要是漏到 URL 里，请求就会带上 `status=all`。
 *
 * 「全部 X」与无障碍名都按当前语言在渲染期拼（ICU 带参，不拼字符串）；`label` 缺省是
 * 「状态」这个历史默认，能说清筛什么时一律显式传。
 */
export function StatusFilter<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    /** 筛什么：同时用作无障碍名与「全部 X」选项文案 */
    label?: string
    value?: T
    options: readonly StatusOption<T>[]
    onChange: (value: T | undefined) => void
}) {
    const t = useT()
    const resolvedLabel = label ?? t("common.filter.status")
    return (
        <Select
            value={value ?? ALL}
            onValueChange={(next) =>
                onChange(options.find((option) => option.value === next)?.value)
            }
        >
            <SelectTrigger aria-label={t("common.filter.aria", { label: resolvedLabel })}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>
                    {t("common.filter.all", { label: resolvedLabel })}
                </SelectItem>
                {options.map((option) => (
                    <SelectItem
                        key={option.value}
                        value={option.value}
                    >
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
