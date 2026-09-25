import { createFileRoute } from "@tanstack/react-router"
import { createPaginationSearchSchema } from "@shop/app-kit"
import { z } from "zod"
import { AccountListPage } from "#/account/list-page"
import { UserStatusSchema } from "#/account/constants"

export const Route = createFileRoute("/_app/accounts/users")({
    validateSearch: createPaginationSearchSchema(20).extend({
        status: UserStatusSchema.optional(),
        keyword: z.string().optional(),
    }),
    component: UsersPage,
})

function UsersPage() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <AccountListPage
            kind="user"
            search={search}
            navigate={navigate}
        />
    )
}
