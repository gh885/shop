import { Input } from "@shop/ui-web"

export function IdFilter({
    label,
    value,
    onChange,
    onSubmit,
    className = "w-48",
}: {
    label: string
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
    className?: string
}) {
    return (
        <Input
            aria-label={label}
            placeholder={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
                // 输入法拼到一半的 Enter 是「选词」，不是提交
                if (event.key === "Enter" && !event.nativeEvent.isComposing) onSubmit()
            }}
            className={className}
        />
    )
}
