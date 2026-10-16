import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"

/** variant=row 整行可点的选项行；内边距只在 row 下生成（compoundVariants）——普通 label 挤进 padding 会错位 */
const labelVariants = cva(
    "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    {
        variants: {
            variant: {
                default: null,
                row: "w-full min-w-0 cursor-pointer rounded-md hover:bg-muted",
            },
            size: {
                default: null,
                compact: null,
            },
        },
        compoundVariants: [
            { variant: "row", size: "default", className: "px-2 py-2" },
            { variant: "row", size: "compact", className: "py-1" },
        ],
        defaultVariants: { variant: "default", size: "default" },
    },
)

function Label({
    className,
    variant,
    size,
    ...props
}: React.ComponentProps<"label"> & VariantProps<typeof labelVariants>) {
    return (
        <label
            data-slot="label"
            className={cn(labelVariants({ variant, size }), className)}
            {...props}
        />
    )
}

export { Label }
