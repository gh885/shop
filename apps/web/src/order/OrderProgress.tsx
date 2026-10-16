import { Check } from "lucide-react"

import { cn } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import { ORDER_PROGRESS_STEP, ORDER_PROGRESS_STEP_COUNT } from "./constants"
import { orderProgressStep } from "./order-label"
import type { OrderStatus } from "./model"

export function OrderProgress({ status }: { status: OrderStatus }) {
    const step = ORDER_PROGRESS_STEP[status]
    const t = useT()
    const steps = Array.from({ length: ORDER_PROGRESS_STEP_COUNT }, (_, index) =>
        orderProgressStep(index, t),
    )

    return (
        <div className="flex flex-wrap items-center gap-y-3">
            {steps.map((label, index) => {
                const done = index < step
                const current = index === step
                return (
                    <div
                        key={label}
                        className={index === 0 ? "flex items-center" : "flex flex-1 items-center"}
                    >
                        <div
                            className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
                                done
                                    ? "bg-accent text-accent-foreground"
                                    : current
                                      ? "border-2 border-accent-foreground text-accent-foreground"
                                      : "border border-border bg-background text-muted-foreground",
                            )}
                        >
                            {done ? (
                                <Check className="size-3.5" />
                            ) : (
                                <span className="text-xs">{index + 1}</span>
                            )}
                        </div>
                        <span
                            className={cn(
                                "ml-2 whitespace-nowrap text-sm",
                                done || current ? "text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {label}
                        </span>

                        {index < steps.length - 1 && (
                            <div
                                className={cn(
                                    "mx-2 h-px min-w-2 flex-1",
                                    index < step ? "bg-accent-foreground" : "bg-border",
                                )}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
