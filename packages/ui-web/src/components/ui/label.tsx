import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"

/**
 * `row` = 整行可点的选项行（勾选 / 单选）：拉满宽度、cursor-pointer、hover 反馈，
 * 免得每个列表各抄一串 `w-full cursor-pointer rounded-md px-2 py-2 hover:bg-muted`。
 * 密度走 `size`：`compact` 给靠父级缩进排版的树形列表（只有纵向留白）。
 * 两个轴都只在 `row` 下产生内边距——标题上方的普通 label 挤进 padding 会错位。
 */
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
