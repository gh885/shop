import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { AuditFilters } from "#/audit/filters"
import { useAuditColumns } from "#/audit/columns"
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
 */
function AuditsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const t = useT()
    const columns = useAuditColumns()
    const query = useQuery(auditListOptions(search))

    return (
        <PagedListShell
            title={t("admin.audit.page.title")}
            description={t("admin.audit.page.description")}
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent={t("admin.audit.page.empty")}
            draftKeys={["operatorId", "targetId", "from", "to"]}
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
