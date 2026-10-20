import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { ShopOpsFilters } from "#/domains/shop-ops/filters"
import { useShopColumns } from "#/domains/shop-ops/columns"
import { adminShopListOptions } from "#/domains/shop-ops/queries"
import { shopOpsSearchSchema } from "#/domains/shop-ops/search"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_authenticated/shops")({
    validateSearch: shopOpsSearchSchema,
    component: ShopsRoute,
})

function ShopsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const t = useT()
    const query = useQuery(adminShopListOptions(search))
    const columns = useShopColumns()

    return (
        <PagedListShell
            title={t("shopOps.page.title")}
            description={t("shopOps.page.description")}
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent={t("shopOps.page.empty")}
            draftKeys={["keyword"]}
            filters={
                <ShopOpsFilters
                    search={search}
                    navigate={navigate}
                />
            }
        />
    )
}
