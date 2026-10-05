import type { ColumnDef, RowData } from "@tanstack/react-table"
import { createContext, use, useRef, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { StatusOption } from "@shop/common/domain"
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

/** 当前 URL 状态，筛选控件按 `name` 从这里取值 */
const SearchContext = createContext<Search>({})

/** 把一部分参数写回当前路由的 URL，其余参数保留 */
function usePatchSearch() {
    const navigate = useNavigate()
    // 函数式写回：TanStack Router 的 `search: 对象` 是整体替换，只写一部分会清掉其余参数
    return (patch: Search) =>
        void navigate({
            to: ".",
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 外壳不绑定具体路由，推不出 search 类型；写回的值已由各路由 validateSearch 兜底校验
            search: ((prev: Search) => ({ ...prev, ...patch })) as never,
        })
}

/**
 * 提交筛选 = 表单里所有文本框的草稿 + 触发这次提交的那个控件的新值，并回到第 1 页。
 * 空串折回 undefined，不进 URL。
 */
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

/**
 * 服务端分页列表页：页头 + 筛选栏 + 表卡 + 分页，URL 读写都收在这里。
 *
 * 页面只给 `search`（路由校验过的整份 URL 状态）、取数结果和列；筛选控件按 `name`
 * 声明在 children 里。改筛选回第 1 页、翻页带着筛选写回，都不需要页面操心。
 *
 * 筛选栏是一个原生 form：文本框只有 `defaultValue`，提交时读 FormData 写回 URL，
 * 不需要每个字段一份 useState。form 按筛选值（不含 page/size）作 key——后退、点侧栏
 * 回到本页这类「URL 变了、组件没卸载」时重挂，输入框才对得上 URL；翻页不冲掉没提交的草稿。
 */
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
    /** 页头右侧的页面级动作（新建等） */
    actions?: ReactNode
    /** 路由校验过的整份 URL 状态（page/size 是 1-based） */
    search: { page: number; size: number }
    query: { data?: { records: TData[]; total: number }; isPending: boolean }
    columns: ColumnDef<DataTableFeatures, TData>[]
    emptyContent: string
    /** 工具栏右侧的附加动作（导出等），缺省是列显隐 */
    toolbarActions?: ReactNode
    /** 筛选控件 */
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

/** 文本筛选：回车提交。宽度由调用点给字面量 className（DESIGN.md：动态拼接扫不出来） */
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
                // 挡掉浏览器的表单隐式提交（会整页 GET 跳转），提交走下面这一条
                event.preventDefault()
                // isComposing：中文输入法拼到一半的 Enter 是「选词」不是「提交」
                if (!event.nativeEvent.isComposing) submit(event.currentTarget.form)
            }}
        />
    )
}

/** Select 不接受空值，「不筛」用这个哨兵占位 */
const ALL = "all"

/**
 * 枚举筛选：选中即提交（连同文本框里没回车的草稿）。
 * 「全部」折回 undefined——哨兵要是漏到 URL 里，请求就会带上 `status=all`。
 *
 * 「全部 X」与无障碍名按当前语言在渲染期拼（ICU 带参，不拼字符串）；`label` 缺省是
 * 「状态」这个历史默认，能说清筛什么时一律显式传。
 */
export function SelectFilter({
    name,
    label,
    options,
}: {
    name: string
    /** 筛什么：同时用作无障碍名与「全部 X」选项文案 */
    label?: string
    options: readonly StatusOption[]
}) {
    const t = useT()
    const value = use(SearchContext)[name]
    const submit = useSubmitFilters()
    // 选项浮层渲染在 portal 里，拿不到所在的 form，只能从留在表单里的触发器去找
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
