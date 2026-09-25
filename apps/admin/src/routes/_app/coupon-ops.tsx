import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { CouponOpsPage } from "#/coupon-ops/list-page"
import { CouponStatusSchema } from "#/coupon-ops/constants"

export const Route = createFileRoute("/_app/coupon-ops")({
    validateSearch: z.object({
        userId: z.string().uuid().optional(),
        shopId: z.string().uuid().optional(),
        status: CouponStatusSchema.optional(),
        page: z.coerce.number().int().min(1).catch(1),
        size: z.coerce.number().int().min(1).catch(20),
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
