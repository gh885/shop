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
import { useT } from "#/locales/use-t"

// Select 不接受空值：「不筛」用这个哨兵占位，回调时折回 undefined
const ALL = "all"

interface CmsListFilter {
    label: string
    value?: string
    options: readonly string[]
    onChange: (value: string | undefined) => void
}

export interface CmsListShellProps<T extends RowData> {
    title: string
    description: ReactNode
    columns: ColumnDef<DataTableFeatures, T>[]
    rows: T[]
    isPending: boolean
    emptyContent: string
    createText: string
    filter?: CmsListFilter
    renderCreate: (state: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode
}

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
    const t = useT()
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

            {/* 列显隐与分页条读 DataTable provider：放到它外面就渲染不出来 */}
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
                            <SelectTrigger
                                aria-label={t("common.filter.aria", { label: filter.label })}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>
                                    {t("common.filter.all", { label: filter.label })}
                                </SelectItem>
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
