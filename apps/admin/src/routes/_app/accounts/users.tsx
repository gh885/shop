import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AccountFilters } from "#/account/filters"
import { userColumns } from "#/account/columns"
import { USER_STATUS_OPTIONS } from "#/account/constants"
import { adminUsersOptions, userSearchSchema } from "#/account/queries"
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

    return (
        <PagedListShell
            title="用户管理"
            description="查看买家账号并管理登录状态"
            search={search}
            navigate={navigate}
            query={query}
            columns={userColumns}
            emptyContent="暂无符合条件的账号"
            filters={
                <AccountFilters
                    search={search}
                    navigate={navigate}
                    options={USER_STATUS_OPTIONS}
                />
            }
        />
    )
}
