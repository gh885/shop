import { createFileRoute } from "@tanstack/react-router"
import { ShopOpsPage } from "#/shop-ops/list-page"
import { shopOpsSearchSchema } from "#/shop-ops/queries"

export const Route = createFileRoute("/_app/shops")({
    validateSearch: shopOpsSearchSchema,
    component: ShopsRoute,
})

function ShopsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <ShopOpsPage
            search={search}
            navigate={navigate}
        />
    )
}
