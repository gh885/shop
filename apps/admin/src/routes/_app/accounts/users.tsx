import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { AccountListPage } from "#/account/list-page"
import { UserStatusSchema } from "#/account/constants"

export const Route = createFileRoute("/_app/accounts/users")({
    validateSearch: z.object({
        status: UserStatusSchema.optional(),
        keyword: z.string().optional(),
        page: z.coerce.number().int().min(1).catch(1),
        size: z.coerce.number().int().min(1).catch(20),
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
