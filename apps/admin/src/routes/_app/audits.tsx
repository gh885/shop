import { createFileRoute } from "@tanstack/react-router"
import { AuditPage } from "#/audit/list-page"
import { auditSearchSchema } from "#/audit/queries"

export const Route = createFileRoute("/_app/audits")({
    validateSearch: auditSearchSchema,
    component: AuditsRoute,
})

function AuditsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <AuditPage
            search={search}
            navigate={navigate}
        />
    )
}
