import type { ColumnDef, RowData } from "@tanstack/react-table"
import { createContext, use, useRef, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { StatusOption } from "@shop/common/domain"
import { useOutOfRangePageGuard } from "@shop/app-kit/data"
import {
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    type DataTableFeatures,
} from "@shop/ui-web"
import { usePagedTable } from "#/shared/lib/paged-table"
import { ListBody } from "#/shared/ui/list-body"
import { PageHeader } from "#/shared/ui/page-header"
import { useT } from "#/locales/use-t"

type Search = Record<string, unknown>

const SearchContext = createContext<Search>({})

function usePatchSearch() {
    const navigate = useNavigate()
    // 必须函数式写回：search 传对象是整体替换，只写部分会清掉其余参数
    return (patch: Search, options?: { replace?: boolean }) =>
        void navigate({
            to: ".",
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 外壳不绑定具体路由，推不出 search 类型；写回的值已由各路由 validateSearch 兜底校验
            search: ((prev: Search) => ({ ...prev, ...patch })) as never,
            replace: options?.replace,
        })
}

// 提交筛选 = 文本框草稿 + 触发控件的新值，回到第 1 页；空串折回 undefined，不进 URL
function useSubmitFilters() {
    const patchSearch = usePatchSearch()
    return (form: HTMLFormElement | null | undefined, patch: Search = {}) => {
        const next = { ...Object.fromEntries(new FormData(form ?? undefined)), ...patch }
        patchSearch({
            ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v || undefined])),
            page: 1,
        })
    }
}

export function ListShell<TData extends { id: string } & RowData>({
    title,
    description,
    actions,
    search,
    query,
    columns,
    emptyContent,
    toolbarActions,
    children,
}: {
    title: string
    description: string
    actions?: ReactNode
    /** 路由校验过的整份 URL 状态；page/size 是 1-based */
    search: { page: number; size: number }
    query: { data?: { records: TData[]; total: number }; isPending: boolean }
    columns: ColumnDef<DataTableFeatures, TData>[]
    emptyContent: string
    toolbarActions?: ReactNode
    children?: ReactNode
}) {
    const patchSearch = usePatchSearch()
    const table = usePagedTable<TData>({
        columns,
        rows: query.data?.records ?? [],
        total: query.data?.total,
        page: search.page,
        size: search.size,
        onPageChange: (page, size) => patchSearch({ page, size }),
    })

    // 越界页码收口：数据落定后才判（上界只有服务端知道），replace 不留历史
    useOutOfRangePageGuard({
        page: search.page,
        total: query.data?.total,
        size: search.size,
        onFix: (page) => patchSearch({ page }, { replace: true }),
    })

    const { page: _page, size: _size, ...filterValues } = search

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
                    <form
                        key={JSON.stringify(filterValues)}
                        className="contents"
                    >
                        <SearchContext value={search}>{children}</SearchContext>
                    </form>
                </DataTableToolbar>
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
        </div>
    )
}

export function TextFilter({
    name,
    label,
    className = "w-48",
}: {
    name: string
    label: string
    className?: string
}) {
    const value = use(SearchContext)[name]
    const submit = useSubmitFilters()
    return (
        <Input
            name={name}
            aria-label={label}
            placeholder={label}
            defaultValue={typeof value === "string" ? value : ""}
            className={className}
            onKeyDown={(event) => {
                if (event.key !== "Enter") return
                // 挡住浏览器的隐式提交（会整页 GET 跳转），提交走下面那条
                event.preventDefault()
                // 输入法拼到一半的 Enter 是「选词」，不是提交
                if (!event.nativeEvent.isComposing) submit(event.currentTarget.form)
            }}
        />
    )
}

// Select 不接受空值，「不筛」用这个哨兵占位
const ALL = "all"

// 「全部」折回 undefined：哨兵要是漏进 URL，请求就会带上 status=all
export function SelectFilter({
    name,
    label,
    options,
}: {
    name: string
    label?: string
    options: readonly StatusOption[]
}) {
    const t = useT()
    const value = use(SearchContext)[name]
    const submit = useSubmitFilters()
    // 选项浮层渲染在 portal 里拿不到所在 form，只能从留在表单里的触发器去找
    const trigger = useRef<HTMLButtonElement>(null)
    const resolvedLabel = label ?? t("common.filter.status")
    return (
        <Select
            value={typeof value === "string" ? value : ALL}
            onValueChange={(next) =>
                submit(trigger.current?.form, {
                    [name]: options.find((option) => option.value === next)?.value,
                })
            }
        >
            <SelectTrigger
                ref={trigger}
                aria-label={t("common.filter.aria", { label: resolvedLabel })}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>
                    {t("common.filter.all", { label: resolvedLabel })}
                </SelectItem>
                {options.map((option) => (
                    <SelectItem
                        key={option.value}
                        value={option.value}
                    >
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
