import { useState } from "react"
import { z } from "zod"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import {
    Button,
    DataTable,
    DataTableSkeleton,
    DataTableToolbar,
    DataTableViewOptions,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useDataTable,
} from "@shop/ui-web"

import { CMS_NAV_KEYS } from "#/cms/constants"
import { NavFormDialog } from "#/cms/nav/form-dialog"
import { navListOptions } from "#/cms/nav/queries"
import { navColumns } from "#/cms/nav/table"

export const Route = createFileRoute("/_app/cms/nav")({
    validateSearch: z.object({
        navKey: z.string().trim().min(1).max(32).optional(),
    }),
    component: NavPage,
})

function NavPage() {
    const { navKey } = Route.useSearch()
    const navigate = Route.useNavigate()
    const [createOpen, setCreateOpen] = useState(false)

    const { data: entries = [], isPending } = useQuery(navListOptions(navKey))

    const { table } = useDataTable({
        columns: navColumns,
        data: entries,
        getRowId: (row) => row.id,
    })

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">首页导航</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    买家端顶部导航与 mega
                    面板配置；分组/词条整段随条目保存，停用即隐藏、不做物理删除
                </p>
            </div>

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
                            新增条目
                        </Button>
                        <DataTableViewOptions table={table} />
                    </>
                }
            >
                <Select
                    value={navKey ?? "all"}
                    onValueChange={(value) =>
                        void navigate({
                            search: { navKey: value === "all" ? undefined : (value ?? undefined) },
                        })
                    }
                >
                    <SelectTrigger aria-label="导航位">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部导航位</SelectItem>
                        {CMS_NAV_KEYS.map((k) => (
                            <SelectItem
                                key={k}
                                value={k}
                            >
                                {k}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </DataTableToolbar>

            {isPending ? (
                <DataTableSkeleton columns={navColumns.length} />
            ) : (
                <DataTable
                    table={table}
                    emptyContent="暂无符合条件的导航条目"
                />
            )}

            <NavFormDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                defaultNavKey={navKey}
            />
        </div>
    )
}
