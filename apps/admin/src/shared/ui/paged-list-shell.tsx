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
import { useOutOfRangePageGuard } from "@shop/app-kit/data"

/** 写回整份 URL 状态；search 传对象是整体替换，只写 page/size 会清掉筛选。replace 只给越界页码收口用 */
export type SearchNavigate<S> = (options: { search: S; replace?: boolean }) => void

export function PagedListShell<
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
    draftKeys,
}: {
    title: string
    description: string
    actions?: ReactNode
    /** 路由校验过的整份 URL 状态；page/size 是 1-based */
    search: TSearch
    navigate: SearchNavigate<TSearch>
    query: { data?: { records: TData[]; total: number }; isPending: boolean }
    columns: ColumnDef<DataTableFeatures, TData>[]
    emptyContent: string
    filters: ReactNode
    toolbarActions?: ReactNode
    /** 本地草稿对应的 URL 键；不传则除 page/size 外全算 */
    draftKeys?: Exclude<keyof TSearch, "page" | "size">[]
}) {
    const table = usePagedTable<TData>({
        columns,
        rows: query.data?.records ?? [],
        total: query.data?.total,
        page: search.page,
        size: search.size,
        onPageChange: (page, size) => navigate({ search: { ...search, page, size } }),
    })

    // 越界页码收口：数据落定后才判（上界只有服务端知道），replace 不留历史
    useOutOfRangePageGuard({
        page: search.page,
        total: query.data?.total,
        size: search.size,
        onFix: (page) => navigate({ search: { ...search, page }, replace: true }),
    })

    // 筛选栏输入是本地草稿（回车才写回），只在挂载时读一次 URL；按 draftValues 作键重挂，page/size 不进键所以翻页不冲掉草稿
    const { page: _page, size: _size, ...filterValues } = search
    const draftValues = draftKeys
        ? Object.fromEntries(draftKeys.map((key) => [key, filterValues[key]]))
        : filterValues

    return (
        <div className="space-y-4">
            <PageHeader
                title={title}
                description={description}
                actions={actions}
            />
            {/* 工具栏与表卡必须在 DataTable 内：reui 的列显隐/分页条读它的 provider，放外面渲染不出来 */}
            <DataTable
                table={table}
                emptyContent={emptyContent}
            >
                <DataTableToolbar
                    table={table}
                    actions={toolbarActions ?? <DataTableViewOptions table={table} />}
                >
                    <Fragment key={JSON.stringify(draftValues)}>{filters}</Fragment>
                </DataTableToolbar>
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
        </div>
    )
}
