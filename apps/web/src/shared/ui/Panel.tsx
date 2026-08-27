import type * as React from "react"

import { cn } from "@shop/ui-web"

/**
 * 满宽分组容器：顶部 header 信息条 + 下方分割行列表。
 *
 * 与 `Card` 的区别：header 与 content 均**满宽、无内边距**（由子项自带 padding），
 * 用于「列表式分组」而非「标题内容卡」——如订单卡、店铺商品分组。
 * 统一圆角/边框/分割线，避免各处手写类串不一致。
 */

function Panel({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="panel"
            className={cn(
                "overflow-hidden rounded-xl border border-border/60 bg-background",
                className,
            )}
            {...props}
        />
    )
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="panel-header"
            className={cn("flex items-center gap-4 border-b border-border/60 px-5 py-3", className)}
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
