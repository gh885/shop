import { AdminCouponsApi } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { USER_COUPON_STATUSES } from "@shop/common/domain"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

const CouponStatusSchema = z.enum(USER_COUPON_STATUSES)

export const couponOpsSearchSchema = createPaginationSearchSchema(20).extend({
    userId: z.string().uuid().optional(),
    shopId: z.string().uuid().optional(),
    status: CouponStatusSchema.optional(),
})
export type CouponOpsSearch = z.infer<typeof couponOpsSearchSchema>

export const couponOpsKeys = {
    all: ["admin", "coupon-ops"] as const,
    list: (input: CouponOpsSearch) => [...couponOpsKeys.all, input] as const,
}

export const adminCouponListOptions = (input: CouponOpsSearch) =>
    queryOptions({
        queryKey: couponOpsKeys.list(input),
        queryFn: async () => {
            const result = await AdminCouponsApi.listAdminCoupons({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: {
                        userId: input.userId,
                        shopId: input.shopId,
                        status: input.status,
                    },
                },
            })
            return { records: result.records, total: result.total }
        },
        placeholderData: (previous) => previous,
    })
