"use client"

import { type Table } from "@tanstack/react-table"
import { XIcon } from "lucide-react"

import { Button } from "src/components/ui/button"
import { Input } from "src/components/ui/input"

import { DataTableFacetedFilter, type DataTableFilterConfig } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"

type DataTableToolbarProps<TData> = {
    table: Table<TData>
    searchPlaceholder?: string
    /** 传则列过滤，否则全局过滤 */
    searchKey?: string
    filters?: DataTableFilterConfig[]
}

/** 稳定的空数组引用，避免每次 render 重建默认值 */
const NO_FILTERS: DataTableFilterConfig[] = []

/** 工具栏：搜索 + faceted 筛选 + 重置 + 列显隐 */
export function DataTableToolbar<TData>({
    table,
    searchPlaceholder,
    searchKey,
    filters = NO_FILTERS,
}: DataTableToolbarProps<TData>) {
    const isFiltered = table.getState().columnFilters.length > 0
    const searchValue = searchKey ? table.getColumn(searchKey)?.getFilterValue() : undefined
    const globalFilter = table.getState().globalFilter

    return (
        <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-2">
                {searchPlaceholder &&
                    (searchKey ? (
                        <Input
                            placeholder={searchPlaceholder}
                            value={typeof searchValue === "string" ? searchValue : ""}
                            onChange={(event) =>
                                table.getColumn(searchKey)?.setFilterValue(event.target.value)
                            }
                            className="h-8 w-48"
                        />
                    ) : (
                        <Input
                            placeholder={searchPlaceholder}
                            value={typeof globalFilter === "string" ? globalFilter : ""}
                            onChange={(event) => table.setGlobalFilter(event.target.value)}
                            className="h-8 w-48"
                        />
                    ))}
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
                            table.resetColumnFilters()
                            table.setGlobalFilter("")
                        }}
                    >
                        重置
                        <XIcon className="size-3.5 ms-1" />
                    </Button>
                )}
            </div>
            <DataTableViewOptions table={table} />
        </div>
    )
}
