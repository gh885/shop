import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AuditFilters } from "#/audit/filters"
import { auditColumns } from "#/audit/columns"
import { ExportButton } from "#/audit/export-button"
import { auditListOptions, auditSearchSchema } from "#/audit/queries"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/audits")({
    validateSearch: auditSearchSchema,
    component: AuditsRoute,
})

/**
 * 操作审计查询页：按操作人 / 对象 / 时间窗反查治理账本。
 *
 * 页面只管三件事：取数、把 URL 状态与筛选写回、把「导出」做成一次带二次确认的动作。
 * 列与文案在 `#/audit/columns` / `#/audit/constants`，筛选栏在 `#/audit/filters`，
 * 导出按钮在 `#/audit/export-button`，CSV 拼装在 `#/audit/export`——本页里没有业务判定。
 */
function AuditsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const query = useQuery(auditListOptions(search))

    return (
        <PagedListShell
            title="操作审计"
            description="封号、作废券、审核、封店、员工调权的统一留痕；敏感字段只落掩码"
            search={search}
            navigate={navigate}
            query={query}
            columns={auditColumns}
            emptyContent="该条件下没有审计记录"
            filters={
                <AuditFilters
                    search={search}
                    navigate={navigate}
                />
            }
            toolbarActions={<ExportButton search={search} />}
        />
    )
}
