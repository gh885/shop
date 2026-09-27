import { useQuery } from "@tanstack/react-query"
import { DataTable, DataTableCard, DataTableSkeleton, useDataTable } from "@shop/ui-web"
import { PageHeader } from "#/shared/ui/page-header"
import { issueColumns } from "./columns"
import { openIssuesOptions } from "./queries"

/**
 * 物流异常待办页：把「该有动静却没有」的包裹变成可处理的待办（LOG-33）。
 *
 * 刻意不分页也不加类型筛选：后端一次性给封顶后的未结单（见 {@code ShipmentIssueMapper.selectOpen}），
 * 待办的用法是「把最卡人的那批处理掉」。在这份封顶列表上再做客户端筛选，会出现
 * 「筛完说没有、其实在截断之外还有」的假空态——那比没有筛选更糟。
 */
export function LogisticsIssuesPage() {
    const { data: issues = [], isPending } = useQuery(openIssuesOptions())

    // 非分页的客户端表：DataTable 的表格上下文仍由 useDataTable 出（列显隐/分页条读 provider）
    const { table } = useDataTable({ columns: issueColumns, data: issues })

    return (
        <div className="space-y-4">
            <PageHeader
                title="物流异常"
                description="揽收超时 / 中转停滞 / 派送停滞的待办清单；处置后从待办消失"
            />
            <DataTable
                table={table}
                emptyContent="当前没有待处理的物流异常"
            >
                {isPending ? (
                    <DataTableSkeleton columns={issueColumns.length} />
                ) : (
                    <DataTableCard />
                )}
            </DataTable>
        </div>
    )
}
