import type { ColumnDef, PaginationState, RowData, Updater } from "@tanstack/react-table"

import { useDataTable, type DataTableFeatures } from "@shop/ui-web"

/**
 * 服务端分页列表的表格接线：URL 里的 `page`/`size` 是唯一真相，翻页写回 URL。
 *
 * 为什么抽出来：这段 `useDataTable` 配置（manual* + 受控 pagination + onPaginationChange 折算）
 * 在三张列表页逐字重复过三遍，而 falsy/off-by-one 的错法每处都能各错一次——
 * 分页是「URL → 表格 → URL」的闭环，重复它等于重复整条链路。
 *
 * 调用点只提供「翻到哪一页、每页几条」这层意图（`onPageChange`，都是 1-based），
 * 别的（pageIndex 从 0 起、updater 可能是函数）都收在这里。
 */
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
    /** 服务端总数（对应 contract 的 `rowCount`）；缺省 = 后端不分页的全量表 */
    total?: number
    /** 1-based 当前页（来自 URL search） */
    page: number
    size: number
    /** 翻页意图：page 1-based，size 为每页条数 */
    onPageChange: (page: number, size: number) => void
}) {
    const pagination: PaginationState = { pageIndex: page - 1, pageSize: size }

    const { table } = useDataTable<TData>({
        columns,
        data: rows,
        getRowId: (row) => row.id,
        rowCount: total,
        // 服务端排序没有接口接：开着只会给每个表头挂上无效的 aria-sort="none"
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
