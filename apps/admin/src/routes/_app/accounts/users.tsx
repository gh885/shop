import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { AccountFilters } from "#/account/filters"
import { useUserColumns } from "#/account/columns"
import { USER_STATUS_OPTIONS } from "#/account/constants"
import { adminUsersOptions, userSearchSchema } from "#/account/queries"
import { useT } from "#/locales/use-t"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/accounts/users")({
    validateSearch: userSearchSchema,
    component: UsersRoute,
})

/** 买家账号列表：只做取数 + 把 URL 状态递给外壳，列在 `#/account/columns`。 */
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
