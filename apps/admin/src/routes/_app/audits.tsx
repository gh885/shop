import { createFileRoute } from "@tanstack/react-router"
import { createPaginationSearchSchema } from "@shop/app-kit"
import { z } from "zod"
import { AuditPage } from "#/audit/list-page"
import {
    AUDIT_ACTION_MAX,
    AUDIT_PAGE_SIZE,
    AUDIT_TARGET_ID_MAX,
    AUDIT_TARGET_TYPE_MAX,
} from "#/audit/constants"

export const Route = createFileRoute("/_app/audits")({
    validateSearch: createPaginationSearchSchema(AUDIT_PAGE_SIZE).extend({
        operatorId: z.string().uuid().optional(),
        targetType: z.string().max(AUDIT_TARGET_TYPE_MAX).optional(),
        targetId: z.string().max(AUDIT_TARGET_ID_MAX).optional(),
        action: z.string().max(AUDIT_ACTION_MAX).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
    }),
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
