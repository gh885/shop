import { createFileRoute } from "@tanstack/react-router"
import { createPaginationSearchSchema } from "@shop/app-kit"
import { z } from "zod"
import { StaffListPage } from "#/account/list-page"
import { StaffStatusSchema } from "#/account/constants"

export const Route = createFileRoute("/_app/accounts/staff")({
    validateSearch: createPaginationSearchSchema(20).extend({
        status: StaffStatusSchema.optional(),
        keyword: z.string().optional(),
    }),
    component: StaffPage,
})

function StaffPage() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <StaffListPage
            kind="staff"
            search={search}
            navigate={navigate}
        />
    )
}
