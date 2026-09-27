import { createFileRoute } from "@tanstack/react-router"
import { StaffListPage } from "#/account/list-page"
import { staffSearchSchema } from "#/account/queries"

export const Route = createFileRoute("/_app/accounts/staff")({
    validateSearch: staffSearchSchema,
    component: StaffPage,
})

function StaffPage() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <StaffListPage
            search={search}
            navigate={navigate}
        />
    )
}
