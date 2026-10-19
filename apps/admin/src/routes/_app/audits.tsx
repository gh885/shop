import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { AuditFilters } from "#/audit/filters"
import { useAuditColumns } from "#/audit/columns"
import { ExportButton } from "#/audit/export-button"
import { auditListOptions } from "#/audit/queries"
import { auditSearchSchema } from "#/audit/search"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/audits")({
    validateSearch: auditSearchSchema,
    component: AuditsRoute,
})

function AuditsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const t = useT()
    const columns = useAuditColumns()
    const query = useQuery(auditListOptions(search))

    return (
        <PagedListShell
            title={t("audit.page.title")}
            description={t("audit.page.description")}
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent={t("audit.page.empty")}
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
