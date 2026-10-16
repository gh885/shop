"use client"

import type { ReactNode } from "react"
import type { ReactTable, RowData } from "@tanstack/react-table"

import { DataGrid, DataGridContainer } from "src/components/reui/data-grid/data-grid"
import { DataGridPagination } from "src/components/reui/data-grid/data-grid-pagination"
import { DataGridTable } from "src/components/reui/data-grid/data-grid-table"
import { Empty, EmptyHeader, EmptyTitle } from "src/components/ui/empty"
import { Skeleton } from "src/components/ui/skeleton"

import { TableShell } from "./table-shell"

import { asDataGridTable, type DataTableFeatures } from "./data-table-features"
import { useDataTableI18n } from "./data-table-i18n-context"

type DataTableProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    /** 不传则取 provider 注入的 emptyText，包进 Empty（DESIGN.md §6.2） */
    emptyContent?: ReactNode
    /** 工具栏与表卡是 DOM 兄弟，间距由调用点 space-y 管 */
    children?: ReactNode
}

/**
 * 列表段上下文 + 项目默认值。DataGrid 不渲染 DOM（只是 context provider），可包在工具栏与表卡外而不扰布局；但列显隐与分页读 useDataGrid()，必须落在 provider 内。
 * recordCount 传 `getRowCount()`（总数，非当前页行数）——reui 分页条的 from/to/共 N 全取它。取数（state 与 manual*）由调用点经 useDataTable 传入。
 */
export function DataTable<TData extends RowData>({
    table,
    emptyContent,
    children,
}: DataTableProps<TData>) {
    const { overrides, emptyText } = useDataTableI18n()
    const resolvedEmptyContent = emptyContent ?? emptyText
    return (
        <DataGrid
            table={asDataGridTable(table)}
            recordCount={table.getRowCount()}
            emptyMessage={
                <Empty className="py-4">
                    <EmptyHeader>
                        <EmptyTitle>{resolvedEmptyContent}</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            }
            i18n={overrides}
        >
            {children}
        </DataGrid>
    )
}

/** 必须渲染在 `DataTable` 内（列显隐/分页读 useDataGrid） */
export function DataTableCard({ className }: { className?: string }) {
    return (
        <TableShell
            className={className}
            footer={<DataGridPagination sizes={[10, 20, 30, 40, 50]} />}
        >
            <DataGridContainer>
                {/* 两层 overflow-hidden 会裁掉宽表末列（通常「操作」），这里补 overflow-x-auto 与 ui/table 对齐 */}
                <div className="overflow-x-auto">
                    <DataGridTable />
                </div>
            </DataGridContainer>
        </TableShell>
    )
}

/** query 调用处选择骨架或数据，不把 isPending 传入数据表。 */
export function DataTableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
    return (
        <TableShell>
            <output className="sr-only">Loading list</output>
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
