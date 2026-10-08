import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { ShopOpsFilters } from "#/shop-ops/filters"
import { useShopColumns } from "#/shop-ops/columns"
import { adminShopListOptions, shopOpsSearchSchema } from "#/shop-ops/queries"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/shops")({
    validateSearch: shopOpsSearchSchema,
    component: ShopsRoute,
})

/**
 * 平台侧店铺治理：看全量店铺、按状态/关键字筛、对营业中的店封停、对已封停的店解封（ACC-60）。
 *
 * 入驻审核（首页）管的是「这店能不能开张」，本页管的是「开张的店要不要继续营业」——
 * 两件事入口不同、后果不同，所以不并进同一个队列页。
 */
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
