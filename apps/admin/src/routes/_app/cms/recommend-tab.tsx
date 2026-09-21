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
    useDataTable,
} from "@shop/ui-web"

import { TabFormDialog } from "#/cms/recommend-tab/form-dialog"
import { tabListOptions } from "#/cms/recommend-tab/queries"
import { tabColumns } from "#/cms/recommend-tab/table"

export const Route = createFileRoute("/_app/cms/recommend-tab")({
    validateSearch: z.object({}),
    component: RecommendTabPage,
})

function RecommendTabPage() {
    const [createOpen, setCreateOpen] = useState(false)
    const { data: tabs = [], isPending } = useQuery(tabListOptions())

    const { table } = useDataTable({
        columns: tabColumns,
        data: tabs,
        getRowId: (row) => row.id,
    })

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">推荐条词条</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    首页猜你喜欢词条栏配置；词条顺序即前台展示顺序，默认词条全局唯一
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
                            新增词条
                        </Button>
                        <DataTableViewOptions table={table} />
                    </>
                }
            />

            {isPending ? (
                <DataTableSkeleton columns={tabColumns.length} />
            ) : (
                <DataTable
                    table={table}
                    emptyContent="暂无推荐词条"
                />
            )}

            <TabFormDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
        </div>
    )
}
