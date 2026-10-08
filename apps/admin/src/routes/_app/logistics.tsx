import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DataTable, DataTableCard, DataTableSkeleton, useDataTable } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { useIssueColumns } from "#/logistics/columns"
import { openIssuesOptions } from "#/logistics/queries"
import { PageHeader } from "#/shared/ui/page-header"

export const Route = createFileRoute("/_app/logistics")({
    component: LogisticsRoute,
})

/**
 * 物流异常待办页：把「该有动静却没有」的包裹变成可处理的待办（LOG-33）。
 *
 * 刻意不分页也不加类型筛选：后端一次性给封顶后的未结单（见 {@code ShipmentIssueMapper.selectOpen}），
 * 待办的用法是「把最卡人的那批处理掉」。在这份封顶列表上再做客户端筛选，会出现
 * 「筛完说没有、其实在截断之外还有」的假空态——那比没有筛选更糟。
 */
function LogisticsRoute() {
    const t = useT()
    const { data: issues = [], isPending } = useQuery(openIssuesOptions())
    const columns = useIssueColumns()

    // 非分页的客户端表：DataTable 的表格上下文仍由 useDataTable 出（列显隐/分页条读 provider）
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
