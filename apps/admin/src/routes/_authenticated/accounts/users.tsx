import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { AccountFilters } from "#/domains/account/filters"
import { useUserColumns } from "#/domains/account/columns"
import { USER_STATUS_OPTIONS } from "#/domains/account/constants"
import { adminUsersOptions } from "#/domains/account/queries"
import { userSearchSchema } from "#/domains/account/search"
import { useT } from "#/locales/use-t"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_authenticated/accounts/users")({
    validateSearch: userSearchSchema,
    component: UsersRoute,
})

function UsersRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const query = useQuery(adminUsersOptions(search))
    const t = useT()
    const columns = useUserColumns()

    return (
        <PagedListShell
            title={t("account.users.title")}
            description={t("account.users.description")}
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent={t("account.list.empty")}
            draftKeys={["keyword"]}
            filters={
                <AccountFilters
                    search={search}
                    navigate={navigate}
                    options={localizeStatusOptions(USER_STATUS_OPTIONS, t)}
                />
            }
        />
    )
}
