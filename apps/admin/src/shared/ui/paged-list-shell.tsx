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

/**
 * 「把整份 URL 状态写回去」这一个动作的形状：路由页把 `Route.useNavigate()` 交进来，
 * 域内筛选栏组件按它收 prop（域不能 import 路由，只能由调用点递）。
 * 集中在这里而不是各处自己抄一遍：手抄的窄签名会把真实 navigate 的其余能力
 * （`search: prev => …`、`replace`）挡在调用点之外。
 *
 * `replace` 是给越界页码收口用的（见下面 `useOutOfRangePageGuard`）：修正页码是「擦掉一个错误
 * 状态」，不该进历史栈。
 */
export type SearchNavigate<S> = (options: { search: S; replace?: boolean }) => void

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
 * 它确实拥有的一件事是「page/size 这个 URL 契约」：翻页写回与**越界页码收口**都住在这里，
 * 所以各列表页不需要（也不该）各抄一份。
 *
 * `search` 必须是**整份** URL 状态：翻页写回时要带着筛选一起写——TanStack Router 的
 * `navigate({ search: 对象 })` 是整体替换，只写 page/size 会把筛选条件一并清掉。
 *
 * 重挂筛选栏的键只算 `draftKeys` 那些格：枚举筛选是「选中即提交」，它写回 URL 时不该把
 * 用户没回车的文本草稿一起冲掉（那些键本来也没有草稿可播种）。
 */
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
    /** 页头右侧的页面级动作（新建等） */
    actions?: ReactNode
    /** URL 里的整份状态（page/size 是 1-based） */
    search: TSearch
    /** 翻页意图：写回 URL */
    navigate: SearchNavigate<TSearch>
    query: { data?: { records: TData[]; total: number }; isPending: boolean }
    columns: ColumnDef<DataTableFeatures, TData>[]
    emptyContent: string
    /** 筛选栏内容（挂在工具栏里，与列显隐/分页条同一 provider） */
    filters: ReactNode
    /** 工具栏右侧的附加动作（导出、视图选项等） */
    toolbarActions?: ReactNode
    /** 本地草稿对应的那几个 URL 键；不传则除 page/size 外全算 */
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

    // 越界页码收口（一次覆盖本外壳下的全部列表页）：封店 / 停券 / 审核通过都会让行离开
    // 当前筛选或页签，删除、筛选变化、陈旧分享链接……任何让列表收缩的原因都走这一个判据。
    // 数据落定后才判（上界只有服务端知道），replace 不留历史。
    useOutOfRangePageGuard({
        page: search.page,
        total: query.data?.total,
        size: search.size,
        onFix: (page) => navigate({ search: { ...search, page }, replace: true }),
    })

    // 筛选栏的输入框是本地草稿（回车才写回 URL），只在挂载时读一次 URL：
    // 后退、点侧栏回到本页这类「URL 变了、组件没卸载」的情况，要按草稿那几格重挂才能对上；
    // page/size 不进键，翻页不冲掉草稿。
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
