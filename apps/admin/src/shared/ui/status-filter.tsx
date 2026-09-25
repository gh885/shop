import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shop/ui-web"
import type { StatusOption } from "@shop/common"

export function StatusFilter({
    value,
    options,
    onChange,
}: {
    value?: string
    options: readonly StatusOption[]
    onChange: (value: string | null) => void
}) {
    return (
        <Select
            value={value ?? "all"}
            onValueChange={onChange}
        >
            <SelectTrigger aria-label="状态筛选">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
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
