import { createFileRoute } from "@tanstack/react-router"
import { UserListPage } from "#/account/list-page"
import { userSearchSchema } from "#/account/queries"

export const Route = createFileRoute("/_app/accounts/users")({
    validateSearch: userSearchSchema,
    component: UsersPage,
})

function UsersPage() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <UserListPage
            search={search}
            navigate={navigate}
        />
    )
}
