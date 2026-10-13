import type { ReactNode } from "react"

import { cn } from "src/lib/utils"

/**
 * 表格外壳：三端列表表格唯一的卡片皮肤（圆角 lg、描边、card 底）+ 可选底栏（计数 / 分页）。
 * DataTable、DataTableSkeleton 与直接用 Table 原语的表格都包这一层，分页放底栏里而不是卡片外。
 *
 * `isolate` 是刻意的：表体内部的层叠（reui DataGrid 的吸顶头 z-40、pin 单元格 30、
 * 单元格编辑器 z-[35]）只跟表内自己比大小，不该和页面级吸顶/壳层抢同一段数值空间。
 * 关进一个层叠上下文后，表内写多大的 z 都出不了这张卡——判据见 DESIGN.md §2.4。
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
