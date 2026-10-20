import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DataTable, DataTableCard, DataTableSkeleton, useDataTable } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { useIssueColumns } from "#/domains/logistics/columns"
import { openIssuesOptions } from "#/domains/logistics/queries"
import { PageHeader } from "#/shared/ui/page-header"

export const Route = createFileRoute("/_app/logistics")({
    component: LogisticsRoute,
})

// 刻意不分页、不加客户端筛选：列表已封顶，筛完会给出「其实在截断之外还有」的假空态
function LogisticsRoute() {
    const t = useT()
    const { data: issues = [], isPending } = useQuery(openIssuesOptions())
    const columns = useIssueColumns()

    const { table } = useDataTable({ columns, data: issues })

    return (
        <div className="space-y-4">
            <PageHeader
                title={t("logistics.page.title")}
                description={t("logistics.page.description")}
            />
            <DataTable
                table={table}
                emptyContent={t("logistics.page.empty")}
            >
                {isPending ? <DataTableSkeleton columns={columns.length} /> : <DataTableCard />}
            </DataTable>
        </div>
    )
}
