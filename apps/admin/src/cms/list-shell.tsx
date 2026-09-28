import { useState, type ReactNode } from "react"

import type { ColumnDef, RowData } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import {
    Button,
    DataTable,
    DataTableCard,
    DataTableSkeleton,
    DataTableToolbar,
    DataTableViewOptions,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useDataTable,
    type DataTableFeatures,
} from "@shop/ui-web"
import { PageHeader } from "#/shared/ui/page-header"

/** Select 不接受空值，「不筛」用这个哨兵占位，回调时再折回 undefined */
const ALL = "all"

interface CmsListFilter {
    /** 筛什么：同时用作触发器的无障碍名与「全部 X」选项文案 */
    label: string
    /** 当前值，缺省 = 不筛 */
    value?: string
    options: readonly string[]
    /** 「不筛」以 undefined 传出，调用点直接写进 URL search */
    onChange: (value: string | undefined) => void
}

export interface CmsListShellProps<T extends RowData> {
    title: string
    description: ReactNode
    columns: ColumnDef<DataTableFeatures, T>[]
    rows: T[]
    isPending: boolean
    emptyContent: string
    /** 新增按钮文案（含对象名：「新增运营位」/「新增词条」） */
    createText: string
    filter?: CmsListFilter
    /** 新增对话框：状态由本页持有，页面自己把当前筛选带进预填 */
    renderCreate: (state: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode
}

/**
 * CMS 列表页骨架：标题说明 + 工具栏（筛选 / 新增 / 列显隐）+ 表格 + 新增对话框。
 *
 * 这些表都是后端不分页的全量小配置表，所以分页/筛选交给 DataTable 的客户端默认行为
 * （客户端分页默认 10 行一页，分页条必须渲染，否则第 11 行起静默消失）、
 * 行 ID 一律取 id；行内动作（编辑 / 启停）在各域的列定义里。
 * 唯一需要 URL 接管的是筛选值本身——它要能被分享出去，也决定新增时的预填。
 */
export function CmsListShell<T extends { id: string } & RowData>({
    title,
    description,
    columns,
    rows,
    isPending,
    emptyContent,
    createText,
    filter,
    renderCreate,
}: CmsListShellProps<T>) {
    const [createOpen, setCreateOpen] = useState(false)
    const { table } = useDataTable({
        columns,
        data: rows,
        getRowId: (row) => row.id,
    })

    return (
        <div className="space-y-4">
            <PageHeader
                title={title}
                description={description}
            />

            {/* DataTable 只提供表格上下文（不渲染 DOM），工具栏与表卡都挂在它里面：
                reui 的列显隐与分页条读 provider，放到外面就渲染不出来 */}
            <DataTable
                table={table}
                emptyContent={emptyContent}
            >
                <DataTableToolbar
                    table={table}
                    actions={
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCreateOpen(true)}
                            >
                                <PlusIcon data-slot="icon" />
                                {createText}
                            </Button>
                            <DataTableViewOptions table={table} />
                        </>
                    }
                >
                    {filter && (
                        <Select
                            value={filter.value ?? ALL}
                            onValueChange={(value) =>
                                filter.onChange(value === ALL ? undefined : (value ?? undefined))
                            }
                        >
                            <SelectTrigger aria-label={filter.label}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>全部{filter.label}</SelectItem>
                                {filter.options.map((option) => (
                                    <SelectItem
                                        key={option}
                                        value={option}
                                    >
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </DataTableToolbar>

                {isPending ? <DataTableSkeleton columns={columns.length} /> : <DataTableCard />}
            </DataTable>

            {renderCreate({ open: createOpen, onOpenChange: setCreateOpen })}
        </div>
    )
}
