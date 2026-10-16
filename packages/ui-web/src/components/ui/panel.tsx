import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"

/**
 * 满宽列表式分组容器：header 信息条 + 下方分割行列表。与 Card 的区别——header 与 content 均满宽、无内边距（子项自带 padding），用于「列表式分组」（订单卡、店铺商品分组）而非「标题内容卡」；外框皮肤与 Card 家族一致。基类带 text-sm，正文尺寸由容器一次给定。
 */

function Panel({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="panel"
            className={cn(
                "overflow-hidden rounded-lg bg-card text-sm ring-1 ring-foreground/10",
                className,
            )}
            {...props}
        />
    )
}

const panelHeaderVariants = cva(
    "flex items-center gap-4 border-b border-border/60 px-5 py-3",
    {
        variants: {
            variant: {
                default: "",
                /** 弱底信息条：订单号/时间这类元信息，与下方商品行分层 */
                muted: "bg-muted/40",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
)

function PanelHeader({
    className,
    variant = "default",
    ...props
}: React.ComponentProps<"div"> & VariantProps<typeof panelHeaderVariants>) {
    return (
        <div
            data-slot="panel-header"
            className={cn(panelHeaderVariants({ variant }), className)}
            {...props}
        />
    )
}

function PanelContent({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="panel-content"
            className={cn("divide-y divide-border/60", className)}
            {...props}
        />
    )
}

export { Panel, PanelHeader, PanelContent }
