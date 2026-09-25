import type { ReactNode } from "react"
import type { ReactTable, RowData } from "@tanstack/react-table"
import {
    DataTable,
    DataTablePagination,
    DataTableSkeleton,
    type DataTableFeatures,
} from "@shop/ui-web"

export function DataTableState<TData extends RowData>({
    isPending,
    columns,
    table,
    emptyContent,
}: {
    isPending: boolean
    columns: number
    table: ReactTable<DataTableFeatures, TData>
    emptyContent: ReactNode
}) {
    if (isPending) return <DataTableSkeleton columns={columns} />
    return (
        <DataTable
            table={table}
            emptyContent={emptyContent}
            footer={<DataTablePagination table={table} />}
        />
    )
}
