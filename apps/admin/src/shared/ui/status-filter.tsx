import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shop/ui-web"
import type { StatusOption } from "@shop/common/domain"
import { useT } from "#/locales/use-t"

// Select 不接受空值，「不筛」用这个哨兵占位
const ALL = "all"

// 「全部」折回 undefined：哨兵要是漏进 URL，请求就会带上 status=all
export function StatusFilter<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
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
