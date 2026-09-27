import type { ColumnDef, RowData } from "@tanstack/react-table"
import type { ReactNode } from "react"
import {
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type DataTableFeatures,
} from "@shop/ui-web"
import { usePagedTable } from "#/shared/lib/paged-table"
import { ListBody } from "#/shared/ui/list-body"

/**
 * 服务端分页列表页的外壳：标题 + 说明 + 筛选栏 + 表卡。
 *
 * **为什么抽**：管理端三张列表页（券运营 / 操作审计 / 店铺治理）此前逐字重复这段装配——
 * `usePagedTable` 的接线、标题区、`DataTable` 上下文、筛选栏插槽、`ListBody` 的骨架/表卡二选一。
 * 重复三遍时，「空态文案该放哪」「筛选栏要不要在 DataTable 里面」这类决定就有三个答案，
 * 而其中一条注释（reui 的列显隐与分页条读 provider，放到 `DataTable` 外面就渲染不出来）
 * 也被抄了三遍——抄注释比抄代码更容易漏掉「为什么」。
 *
 * **边界**：只管外壳，不碰数据。取数在调用点（`useQuery`），分页状态是 URL（`search`），
 * 筛选栏由调用点给（`filters`），工具栏右侧的附加动作由调用点给（`toolbarActions`）。
 */
export function PagedListPage<TData extends { id: string } & RowData>({
    title,
    description,
    search,
    navigate,
    query,
    columns,
    emptyContent,
    filters,
    toolbarActions,
}: {
    title: string
    description: string
    /** URL 里的分页状态（page/size 是 1-based） */
    search: { page: number; size: number }
    /** 翻页意图：写回 URL */
    navigate: (options: { search: { page: number; size: number } }) => void
    query: { data?: { records: TData[]; total: number }; isPending: boolean }
    columns: ColumnDef<DataTableFeatures, TData>[]
    emptyContent: string
    /** 筛选栏内容（挂在工具栏里，与列显隐/分页条同一 provider） */
    filters: ReactNode
    /** 工具栏右侧的附加动作（导出、视图选项等） */
    toolbarActions?: ReactNode
}) {
    const table = usePagedTable<TData>({
        columns,
        rows: query.data?.records ?? [],
        total: query.data?.total,
        page: search.page,
        size: search.size,
        onPageChange: (page, size) => navigate({ search: { page, size } }),
    })

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">{title}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            </div>
            {/* DataTable 只提供表格上下文（不渲染 DOM），工具栏与表卡都挂在它里面：
                reui 的列显隐与分页条读 provider，放到外面就渲染不出来 */}
            <DataTable
                table={table}
                emptyContent={emptyContent}
            >
                <DataTableToolbar
                    table={table}
                    actions={toolbarActions ?? <DataTableViewOptions table={table} />}
                >
                    {filters}
                </DataTableToolbar>
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
        </div>
    )
}
