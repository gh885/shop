import type { ColumnDef, RowData } from "@tanstack/react-table"
import { Fragment, type ReactNode } from "react"
import {
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type DataTableFeatures,
} from "@shop/ui-web"
import { usePagedTable } from "#/shared/lib/paged-table"
import { ListBody } from "#/shared/ui/list-body"
import { PageHeader } from "#/shared/ui/page-header"

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
 *
 * `search` 必须是**整份** URL 状态：翻页写回时要带着筛选一起写——TanStack Router 的
 * `navigate({ search: 对象 })` 是整体替换，只写 page/size 会把筛选条件一并清掉。
 */
export function PagedListPage<
    TData extends { id: string } & RowData,
    TSearch extends { page: number; size: number },
>({
    title,
    description,
    actions,
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
    /** 页头右侧的页面级动作（新建等） */
    actions?: ReactNode
    /** URL 里的整份状态（page/size 是 1-based） */
    search: TSearch
    /** 翻页意图：写回 URL */
    navigate: (options: { search: TSearch }) => void
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
        onPageChange: (page, size) => navigate({ search: { ...search, page, size } }),
    })
    // 筛选栏的输入框是本地草稿（回车才写回 URL），只在挂载时读一次 URL：
    // 后退、点侧栏回到本页这类「URL 变了、组件没卸载」的情况，要按筛选值重挂才能对上。
    // 不含 page/size，翻页不冲掉没提交的草稿
    const { page: _page, size: _size, ...filterValues } = search

    return (
        <div className="space-y-4">
            <PageHeader
                title={title}
                description={description}
                actions={actions}
            />
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
                    <Fragment key={JSON.stringify(filterValues)}>{filters}</Fragment>
                </DataTableToolbar>
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
        </div>
    )
}
