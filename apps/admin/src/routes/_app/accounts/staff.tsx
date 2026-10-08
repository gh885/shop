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
            title={t("account.staff.title")}
            description={t("account.staff.description")}
            actions={<StaffCreateDialog />}
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
                    options={localizeStatusOptions(STAFF_STATUS_OPTIONS, t)}
                />
            }
        />
    )
}
