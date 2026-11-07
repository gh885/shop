import { useId } from "react"

import { Star } from "lucide-react"

import { cn } from "@shop/ui-web"

const STARS = [1, 2, 3, 4, 5] as const

/** 星展示（只读）：value 1-5，半星不拆——评价档位是整数。 */
export function StarRating({ value, className }: { value: number; className?: string }) {
    return (
        <span
            className={cn("inline-flex items-center gap-0.5", className)}
            aria-label={`${value} / 5`}
        >
            {STARS.map((star) => (
                <Star
                    key={star}
                    aria-hidden="true"
                    className={cn(
                        "size-3.5",
                        star <= value
                            ? "fill-cta-alt text-cta-alt"
                            : "fill-muted text-muted-foreground/30",
                    )}
                />
            ))}
        </span>
    )
}

/** 星选择（表单）：原生 radio（视觉隐藏）+ 星图标，键盘与读屏走原生语义；点选即落档。 */
export function StarPicker({
    value,
    onChange,
    size = "size-6",
    className,
}: {
    value: number
    onChange: (value: number) => void
    size?: string
    className?: string
}) {
    // 同页可能有四个 picker（总体 + 三维）：radio 组必须各用各的 name
    const name = useId()
    return (
        <div className={cn("inline-flex items-center gap-1", className)}>
            {STARS.map((star) => (
                <label
                    key={star}
                    className="cursor-pointer transition-transform hover:scale-110"
                >
                    <input
                        type="radio"
                        name={name}
                        value={star}
                        checked={star === value}
                        onChange={() => onChange(star)}
                        className="sr-only"
                        aria-label={`${star}`}
                    />
                    <Star
                        aria-hidden="true"
                        className={cn(
                            size,
                            star <= value
                                ? "fill-cta-alt text-cta-alt"
                                : "fill-muted text-muted-foreground/40",
                        )}
                    />
                </label>
            ))}
        </div>
    )
}
