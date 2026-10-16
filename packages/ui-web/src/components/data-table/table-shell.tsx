import type { ReactNode } from "react"

import { cn } from "src/lib/utils"

/**
 * 三端列表表格唯一的卡片外壳（圆角/描边/card 底 + 可选底栏，分页放底栏里）。
 * `isolate` 是刻意的：把表内 z-index 层叠（reui DataGrid 吸顶头/pin 单元格/编辑器）关进本卡上下文，不与页面级吸顶抢数值；判据见 DESIGN.md §2.4。
 */
export function TableShell({
    children,
    footer,
    className,
}: {
    children: ReactNode
    footer?: ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                "isolate overflow-hidden rounded-lg border border-border bg-card",
                className,
            )}
        >
            {children}
            {footer && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                    {footer}
                </div>
            )}
        </div>
    )
}
