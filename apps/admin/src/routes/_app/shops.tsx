import { createFileRoute } from "@tanstack/react-router"
import { createPaginationSearchSchema } from "@shop/app-kit"
import { z } from "zod"
import { ShopOpsPage } from "#/shop-ops/list-page"
import { SHOP_KEYWORD_MAX, SHOP_OPS_PAGE_SIZE, SHOP_STATUS_MAX } from "#/shop-ops/constants"

export const Route = createFileRoute("/_app/shops")({
    validateSearch: createPaginationSearchSchema(SHOP_OPS_PAGE_SIZE).extend({
        status: z.string().max(SHOP_STATUS_MAX).optional(),
        keyword: z.string().max(SHOP_KEYWORD_MAX).optional(),
    }),
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
