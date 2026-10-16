"use client"

import { type ReactTable, type RowData } from "@tanstack/react-table"
import { SlidersHorizontalIcon } from "lucide-react"

import { DataGridColumnVisibility } from "src/components/reui/data-grid/data-grid-column-visibility"
import { Button } from "src/components/ui/button"

import { asDataGridTable, type DataTableFeatures } from "./data-table-features"
import { useDataTableI18n } from "./data-table-i18n-context"

type DataTableViewOptionsProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
}

/**
 * 列显隐：reui 实现 + 项目触发器，标签由 DataTableI18nProvider 按当前语言注入。
 * 必须渲染在 `DataTable` 内——reui 的 DataGridColumnVisibility 走 `useDataGrid()`。
 */
export function DataTableViewOptions<TData extends RowData>({
    table,
}: DataTableViewOptionsProps<TData>) {
    const { columnsLabel } = useDataTableI18n()
    return (
        <DataGridColumnVisibility
            table={asDataGridTable(table)}
            trigger={
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                >
                    <SlidersHorizontalIcon className="size-3.5" />
                    {columnsLabel}
                </Button>
            }
        />
    )
}
