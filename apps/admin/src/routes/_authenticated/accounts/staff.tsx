import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Fragment } from "react"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { Button, DataTable, DataTableToolbar } from "@shop/ui-web"
import { AccountFilters } from "#/domains/account/filters"
import { useStaffColumns } from "#/domains/account/columns"
import { STAFF_STATUS_OPTIONS } from "#/domains/account/constants"
import { adminStaffOptions } from "#/domains/account/queries"
import { staffSearchSchema } from "#/domains/account/search"
import { StaffCreateDialog } from "#/domains/account/staff-create-dialog"
import { useT } from "#/locales/use-t"
import { ListBody } from "#/shared/ui/list-body"
import { PageHeader } from "#/shared/ui/page-header"
import { usePagedTable } from "#/shared/lib/paged-table"

export const Route = createFileRoute("/_authenticated/accounts/staff")({
    validateSearch: staffSearchSchema,
    component: StaffRoute,
})

/**
 * 员工管理：列表（游标分页）+ 行内调岗 / 禁用 + 建号入口。
 *
 * <p>后端四件事都有端点：`GET /api/admin/staff`（列表）、`POST`（建号）、
 * `PUT /{id}/role`（调岗）、`PATCH /{id}/status`（禁用）。分页交互与买家列表同款——
 * 「加载更多」推进游标，不用 `PagedListShell`（它要服务端总数）。
 */
function StaffRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const t = useT()
    const columns = useStaffColumns()
    const query = useInfiniteQuery(adminStaffOptions(search))

    const rows = query.data?.pages.flatMap((page) => page.items) ?? []

    const table = usePagedTable({
        columns,
        rows,
        total: rows.length,
        page: 1,
        size: Math.max(rows.length, 20),
        onPageChange: () => {},
    })

    return (
        <div className="space-y-4">
            <PageHeader
                title={t("account.staff.title")}
                description={t("account.staff.description")}
                actions={<StaffCreateDialog />}
            />
            <DataTable
                table={table}
                emptyContent={t("account.list.empty")}
            >
                <DataTableToolbar table={table}>
                    <Fragment key={`${search.status ?? ""}:${search.keyword ?? ""}`}>
                        <AccountFilters
                            search={search}
                            navigate={navigate}
                            options={localizeStatusOptions(STAFF_STATUS_OPTIONS, t)}
                        />
                    </Fragment>
                </DataTableToolbar>
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
            {query.hasNextPage && (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                    >
                        {query.isFetchingNextPage ? t("common.loading") : t("common.loadMore")}
                    </Button>
                </div>
            )}
        </div>
    )
}
