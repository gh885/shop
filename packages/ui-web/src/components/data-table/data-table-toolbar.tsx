"use client"

import type { ReactNode } from "react"
import { type ReactTable, type RowData } from "@tanstack/react-table"
import { XIcon } from "lucide-react"

import { Button } from "src/components/ui/button"

import { DataTableFacetedFilter, type DataTableFilterConfig } from "./data-table-faceted-filter"

import type { DataTableFeatures } from "./data-table-features"

type DataTableToolbarProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    filters?: DataTableFilterConfig[]
    children?: ReactNode
    actions?: ReactNode
}

/** 稳定的空数组引用，避免每次 render 重建默认值 */
const NO_FILTERS: DataTableFilterConfig[] = []

/** 工具栏：faceted 筛选 + 重置 + 列显隐。搜索框由调用方按需插入。 */
export function DataTableToolbar<TData extends RowData>({
    table,
    filters = NO_FILTERS,
    children,
    actions,
}: DataTableToolbarProps<TData>) {
    const isFiltered = table.state.columnFilters.length > 0 || Boolean(table.state.globalFilter)

    return (
        <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-2">
                {children}
                {filters.map((filter) => {
                    const column = table.getColumn(filter.columnId)
                    if (!column) return
                    return (
                        <DataTableFacetedFilter
                            key={filter.columnId}
                            column={column}
                            title={filter.title}
                            options={filter.options}
                        />
                    )
                })}
                {isFiltered && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 lg:px-3"
                        onClick={() => {
                            table.resetColumnFilters(true)
                            table.setGlobalFilter("")
                        }}
                    >
                        重置
                        <XIcon className="size-3.5 ms-1" />
                    </Button>
                )}
            </div>
            {actions}
        </div>
    )
}
