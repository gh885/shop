import type { ColumnDef, PaginationState, RowData, Updater } from "@tanstack/react-table"

import { useDataTable, type DataTableFeatures } from "@shop/ui-web"

export function usePagedTable<TData extends { id: string } & RowData>({
    columns,
    rows,
    total,
    page,
    size,
    onPageChange,
}: {
    columns: ColumnDef<DataTableFeatures, TData>[]
    rows: TData[]
    /** 服务端总数；缺省 = 不分页的全量表 */
    total?: number
    /** 1-based 当前页（来自 URL search） */
    page: number
    size: number
    /** 翻页意图：page 1-based */
    onPageChange: (page: number, size: number) => void
}) {
    const pagination: PaginationState = { pageIndex: page - 1, pageSize: size }

    const { table } = useDataTable<TData>({
        columns,
        data: rows,
        getRowId: (row) => row.id,
        rowCount: total,
        // 没有服务端排序接口，开着只给表头挂无效的 aria-sort="none"
        enableSorting: false,
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        state: { pagination },
        onPaginationChange: (updater: Updater<PaginationState>) => {
            const next = typeof updater === "function" ? updater(pagination) : updater
            onPageChange(next.pageIndex + 1, next.pageSize)
        },
    })

    return table
}
