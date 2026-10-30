import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Fragment } from "react"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { Button, DataTable, DataTableToolbar } from "@shop/ui-web"
import { AccountFilters } from "#/domains/account/filters"
import { useBuyerColumns, type BuyerRow } from "#/domains/account/columns"
import { USER_STATUS_OPTIONS } from "#/domains/account/constants"
import { adminBuyersOptions } from "#/domains/account/queries"
import { userSearchSchema } from "#/domains/account/search"
import { useT } from "#/locales/use-t"
import { ListBody } from "#/shared/ui/list-body"
import { PageHeader } from "#/shared/ui/page-header"
import { usePagedTable } from "#/shared/lib/paged-table"

export const Route = createFileRoute("/_authenticated/accounts/users")({
    validateSearch: userSearchSchema,
    component: UsersRoute,
})

/**
 * 买家列表：游标分页，没有服务端总数。
 *
 * <p>不用 `PagedListShell`——它按 page/size 分页、要 `total`，而这里只有 `nextCursor`。
 * 表格仍用 `usePagedTable` 渲染，翻页交给「加载更多」。
 */
function UsersRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const t = useT()
    const columns = useBuyerColumns()
    const query = useInfiniteQuery(adminBuyersOptions(search))

    const rows: BuyerRow[] = (query.data?.pages ?? []).flatMap((page) =>
        page.items.map((item) => ({ ...item, id: item.buyerId })),
    )

    const table = usePagedTable<BuyerRow>({
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
                title={t("account.users.title")}
                description={t("account.users.description")}
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
                            options={localizeStatusOptions(USER_STATUS_OPTIONS, t)}
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
