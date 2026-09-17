"use client"

import type { ReactNode } from "react"
import { FlexRender, Subscribe, type ReactTable, type RowData } from "@tanstack/react-table"

import { cn } from "src/lib/utils"
import { Skeleton } from "src/components/ui/skeleton"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "src/components/ui/table"

import type { DataTableFeatures } from "./data-table-features"

export type DataTableProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    emptyContent?: ReactNode
    className?: string
}

/** 仅渲染表格。工具栏、分页、批量操作及 query 状态均由调用方组合，不强制装配。 */
export function DataTable<TData extends RowData>({
    table,
    emptyContent = "暂无数据",
    className,
}: DataTableProps<TData>) {
    const rows = table.getRowModel().rows
    const colSpan = Math.max(1, table.getVisibleLeafColumns().length)

    return (
        <div className={cn("rounded-lg border border-border bg-card", className)}>
            <Table>
                <TableHeader>
                    {table.getHeaderGroups().map((group) => (
                        <TableRow key={group.id}>
                            {group.headers.map((header) => (
                                <TableHead
                                    key={header.id}
                                    colSpan={header.colSpan}
                                >
                                    {header.isPlaceholder ? undefined : (
                                        <FlexRender header={header} />
                                    )}
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {rows.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={colSpan}
                                className="h-24 text-center text-muted-foreground"
                            >
                                {emptyContent}
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => (
                            <Subscribe
                                key={row.id}
                                source={row.table.store}
                                selector={(state) => ({
                                    selected: state.rowSelection[row.id],
                                    visibility: state.columnVisibility,
                                })}
                            >
                                {({ selected, visibility }) => (
                                    <TableRow data-state={selected ? "selected" : undefined}>
                                        {row
                                            .getAllCells()
                                            .filter((cell) => visibility[cell.column.id] !== false)
                                            .map((cell) => (
                                                <TableCell key={cell.id}>
                                                    <FlexRender cell={cell} />
                                                </TableCell>
                                            ))}
                                    </TableRow>
                                )}
                            </Subscribe>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

/** query 调用处选择骨架或数据，不把 isPending 传入数据表。 */
export function DataTableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
    return (
        <div className="rounded-lg border border-border bg-card">
            <output className="sr-only">正在加载列表</output>
            <Table>
                <TableBody>
                    {Array.from({ length: rows }, (_, row) => (
                        <TableRow key={row}>
                            {Array.from({ length: columns }, (_cell, column) => (
                                <TableCell key={column}>
                                    <Skeleton className="h-4 w-full" />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
