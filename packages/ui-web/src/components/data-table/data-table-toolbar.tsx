"use client"

import type { ReactNode } from "react"
import { type ReactTable, type RowData } from "@tanstack/react-table"
import { XIcon } from "lucide-react"

import { Button } from "src/components/ui/button"

import { useDataTableI18n } from "./data-table-i18n-context"
import type { DataTableFeatures } from "./data-table-features"

type DataTableToolbarProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    children?: ReactNode
    actions?: ReactNode
}

/** 工具栏：重置 + 列显隐。搜索框与筛选控件由调用方按需插入 children。 */
export function DataTableToolbar<TData extends RowData>({
    table,
    children,
    actions,
}: DataTableToolbarProps<TData>) {
    const isFiltered = table.state.columnFilters.length > 0 || Boolean(table.state.globalFilter)
    const { resetText } = useDataTableI18n()

    return (
        <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-2">
                {children}
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
                        {resetText}
                        <XIcon className="size-3.5 ms-1" />
                    </Button>
                )}
            </div>
            {actions}
        </div>
    )
}
