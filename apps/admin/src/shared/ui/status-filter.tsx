import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shop/ui-web"
import type { StatusOption } from "@shop/common/domain" /** Select 不接受空值，「不筛」用这个哨兵占位 */
const ALL = "all"

/**
 * 枚举筛选下拉。「全部」在这里折回 undefined，调用点拿到的只会是 options 里的值，
 * 直接写进 URL search——哨兵要是漏到 URL 里，请求就会带上 `status=all`。
 */
export function StatusFilter<T extends string>({
    label = "状态",
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
    return (
        <Select
            value={value ?? ALL}
            onValueChange={(next) =>
                onChange(options.find((option) => option.value === next)?.value)
            }
        >
            <SelectTrigger aria-label={`${label}筛选`}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>全部{label}</SelectItem>
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
