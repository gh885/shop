import { createFileRoute } from "@tanstack/react-router"
import { createPaginationSearchSchema } from "@shop/app-kit"
import { z } from "zod"
import { CouponOpsPage } from "#/coupon-ops/list-page"
import { CouponStatusSchema } from "#/coupon-ops/constants"

export const Route = createFileRoute("/_app/coupon-ops")({
    validateSearch: createPaginationSearchSchema(20).extend({
        userId: z.string().uuid().optional(),
        shopId: z.string().uuid().optional(),
        status: CouponStatusSchema.optional(),
    }),
    component: CouponOpsRoute,
})

function CouponOpsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <CouponOpsPage
            search={search}
            navigate={navigate}
        />
    )
}
