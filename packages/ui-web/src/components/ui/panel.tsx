import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"

/**
 * 满宽列表式分组容器：顶部 header 信息条 + 下方分割行列表。
 *
 * 与 `Card` 的区别：header 与 content 均**满宽、无内边距**（由子项自带 padding），
 * 用于「列表式分组」而非「标题内容卡」——如订单卡、店铺商品分组。
 * 外框皮肤与 Card 家族保持一致（rounded-xl + ring）。
 *
 * 基类带 `text-sm`：面板内容全是列表行（`Item` 本身就是 text-sm），
 * 正文尺寸由容器一次给定，省得每一处 header 里的文字各自补一遍。
 */

function Panel({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="panel"
            className={cn(
                "overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/10",
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
