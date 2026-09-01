import { cn, Input } from "@shop/ui-web"

/**
 * 带字数计数的输入框：计数器只在有输入时出现——没写字的时候不该先给压力。
 * 超上限由 maxLength 硬拦（不给「写完再被打回」的挫败），
 * 下限（如卖点 10 字）交给校验文案说，计数器只作参考。
 */
export function CountedInput({
    id,
    value,
    max,
    placeholder,
    invalid = false,
    onChange,
    onBlur,
}: {
    id: string
    value: string
    max: number
    placeholder?: string
    invalid?: boolean
    onChange: (value: string) => void
    onBlur?: () => void
}) {
    const count = value.length

    return (
        <div className="relative">
            <Input
                id={id}
                value={value}
                maxLength={max}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                aria-invalid={invalid || undefined}
                className={cn(
                    "h-10 bg-background",
                    count > 0 && "pr-16",
                    invalid && "ring-2 ring-destructive/40",
                )}
            />
            {count > 0 && (
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
                    {count}/{max}
                </span>
            )}
        </div>
    )
}
