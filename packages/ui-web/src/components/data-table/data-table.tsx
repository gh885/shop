"use client"

import * as React from "react"
import {
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type OnChangeFn,
    type PaginationState,
    type SortingState,
} from "@tanstack/react-table"

import { Skeleton } from "src/components/ui/skeleton"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "src/components/ui/table"

import type { DataTableFilterConfig } from "./data-table-faceted-filter"
import { DataTableBulkActions } from "./data-table-bulk-actions"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableToolbar } from "./data-table-toolbar"

export type { DataTableFilterConfig } from "./data-table-faceted-filter"

export type DataTableProps<TData, TValue> = {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    /** 总条数；提供后走服务端分页（getPageCount/getRowCount 用它） */
    rowCount?: number
    isLoading?: boolean
    /** 不传则不渲染搜索框 */
    searchPlaceholder?: string
    /** 传则列过滤，否则全局过滤 */
    searchKey?: string
    filters?: DataTableFilterConfig[]
    /** 选中行后浮出的批量操作；不传则禁用行选择 */
    bulkActions?: React.ReactNode
    /** 批量操作栏的实体名文案（如「店铺」），随 bulkActions 使用 */
    bulkEntityName?: string
    /** 批量操作与行选择的稳定行 id */
    getRowId?: (originalRow: TData, index: number, parent?: unknown) => string
    // 受控状态：传对应 onXxxChange 则外部接管（服务端模式），否则表内自管（客户端模式）
    pagination?: PaginationState
    onPaginationChange?: OnChangeFn<PaginationState>
    sorting?: SortingState
    onSortingChange?: OnChangeFn<SortingState>
    columnFilters?: ColumnFiltersState
    onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>
}

/** 通用数据表：客户端分页/排序/筛选默认自管；传受控回调即切服务端模式 */
export function DataTable<TData, TValue>({
    columns,
    data,
    rowCount,
    isLoading = false,
    searchPlaceholder,
    searchKey,
    filters,
    bulkActions,
    bulkEntityName,
    getRowId,
    pagination,
    onPaginationChange,
    sorting,
    onSortingChange,
    columnFilters,
    onColumnFiltersChange,
}: DataTableProps<TData, TValue>) {
    const manualPagination = Boolean(onPaginationChange)
    const manualSorting = Boolean(onSortingChange)
    const manualFiltering = Boolean(onColumnFiltersChange)

    // oxlint-disable-next-line react/incompatible-library -- TanStack Table 官方指引：返回的 table 对象方法不稳定属预期，不做 memo
    const table = useReactTable({
        data,
        columns,
        rowCount,
        getRowId,
        enableRowSelection: Boolean(bulkActions),
        getCoreRowModel: getCoreRowModel(),
        // 手动（服务端）模式跳过对应客户端模型
        getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
        getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
        getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
        getFacetedRowModel: manualFiltering ? undefined : getFacetedRowModel(),
        getFacetedUniqueValues: manualFiltering ? undefined : getFacetedUniqueValues(),
        manualPagination,
        manualSorting,
        manualFiltering,
        onPaginationChange,
        onSortingChange,
        onColumnFiltersChange,
        state: {
            ...(onPaginationChange && pagination !== undefined ? { pagination } : {}),
            ...(onSortingChange && sorting !== undefined ? { sorting } : {}),
            ...(onColumnFiltersChange && columnFilters !== undefined ? { columnFilters } : {}),
        },
    })

    const rows = table.getRowModel().rows
    const colSpan = columns.length

    return (
        <div className="w-full space-y-4">
            <DataTableToolbar
                table={table}
                searchPlaceholder={searchPlaceholder}
                searchKey={searchKey}
                filters={filters}
            />

            <div className="rounded-lg border border-border bg-card">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? undefined
                                            : flexRender(
                                                  header.column.columnDef.header,
                                                  header.getContext(),
                                              )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading && <SkeletonRows colSpan={colSpan} />}
                        {!isLoading && rows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={colSpan}
                                    className="h-24 text-center text-muted-foreground"
                                >
                                    暂无数据
                                </TableCell>
                            </TableRow>
                        )}
                        {!isLoading &&
                            rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() ? "selected" : undefined}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>

            <DataTablePagination table={table} />

            {bulkActions && (
                <DataTableBulkActions
                    table={table}
                    entityName={bulkEntityName ?? ""}
                >
                    {bulkActions}
                </DataTableBulkActions>
            )}
        </div>
    )
}

function SkeletonRows({ colSpan }: { colSpan: number }) {
    return (
        <>
            {Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                    <TableCell colSpan={colSpan}>
                        <Skeleton className="h-4 w-full" />
                    </TableCell>
                </TableRow>
            ))}
        </>
    )
}
