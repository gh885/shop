import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { AccountFilters } from "#/account/filters"
import { useStaffColumns } from "#/account/columns"
import { STAFF_STATUS_OPTIONS } from "#/account/constants"
import { adminStaffOptions, staffSearchSchema } from "#/account/queries"
import { StaffCreateDialog } from "#/account/staff-create-dialog"
import { useT } from "#/locales/use-t"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/accounts/staff")({
    validateSearch: staffSearchSchema,
    component: StaffRoute,
})

/** 平台员工列表：与买家账号同一份外壳与筛选栏，只差状态枚举和「新建员工」入口。 */
function StaffRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const query = useQuery(adminStaffOptions(search))
    const t = useT()
    const columns = useStaffColumns()

    return (
        <PagedListShell
            title="员工管理"
            description="创建平台员工、调整岗位与管理登录状态"
            actions={<StaffCreateDialog />}
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent="暂无符合条件的账号"
            draftKeys={["keyword"]}
            filters={
                <AccountFilters
                    search={search}
                    navigate={navigate}
                    options={localizeStatusOptions(STAFF_STATUS_OPTIONS, t)}
                />
            }
        />
    )
}
