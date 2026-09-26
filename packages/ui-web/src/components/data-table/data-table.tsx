"use client"

import type { ReactNode } from "react"

import { DataGrid, DataGridContainer, DataGridTable } from "../reui-data-grid"

import type { DataGridTableInstance } from "../reui-data-grid"

import { Skeleton } from "src/components/ui/skeleton"

import { TableShell } from "./table-shell"

import type { DataTableFeatures } from "./data-table-features"
import type { ReactTable, RowData } from "@tanstack/react-table"

/**
 * 表格渲染器：项目的列表外壳（TableShell）+ reui DataGrid 的表体（DataGridTable）。
 *
 * 接线要点（都收在这里，调用方与列定义零改动）：
 *  - 取数不在这一层。分页/排序/筛选的 state 归 TanStack Query，列上开 manual* 让表格跳过
 *    本地行模型；DataGrid 只渲染传入的 table 实例（recordCount 传已加载行数，只用于
 *    aria-rowcount 的下标上界与「新增行」入口，我们不启用后者）。
 *  - 列 meta 归一：列定义写的是项目形状 `{variant, className}`（列语义 strong/muted +
 *    表头与单元格共用的 class），reui 读的是 `{headerClassName, cellClassName}`。这里在建表
 *    前把每个可见列的 meta 补成 reui 形状，`variant` 按 ui/table 的 tableCellVariants 落成
 *    同样的 font-medium / text-muted-foreground 两条类。
 *  - 空态：reui 默认英文，用 emptyMessage 传项目文案。
 */
type DataTableProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    emptyContent?: ReactNode
    /** 外壳底栏：一般放 DataTablePagination */
    footer?: ReactNode
    className?: string
}

/** 仅渲染表格。工具栏、分页、批量操作及 query 状态均由调用方组合，不强制装配。 */
export function DataTable<TData extends RowData>({
    table,
    emptyContent = "暂无数据",
    footer,
    className,
}: DataTableProps<TData>) {
    const recordCount = table.getRowModel().rows.length

    return (
        <TableShell
            footer={footer}
            className={className}
        >
            <DataGrid
                // 列 meta 已在 useDataTable 建表前归一（见 use-data-table.ts）
                table={table as unknown as DataGridTableInstance<TData>}
                recordCount={recordCount}
                emptyMessage={emptyContent}
                tableLayout={{ rowBorder: true, width: "fixed" }}
            >
                <DataGridContainer>
                    <DataGridTable />
                </DataGridContainer>
            </DataGrid>
        </TableShell>
    )
}

/** query 调用处选择骨架或数据，不把 isPending 传入数据表。 */
export function DataTableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
    return (
        <TableShell>
            <output className="sr-only">正在加载列表</output>
            <table className="w-full caption-bottom text-sm">
                <tbody>
                    {Array.from({ length: rows }, (_, row) => (
                        <tr key={row}>
                            {Array.from({ length: columns }, (_, column) => (
                                <td
                                    key={column}
                                    className="p-2"
                                >
                                    <Skeleton className="h-4 w-full" />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </TableShell>
    )
}
