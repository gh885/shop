import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { USER_COUPON_STATUSES } from "@shop/common/domain"
import { z } from "zod"

const CouponStatusSchema = z.enum(USER_COUPON_STATUSES)

export const couponOpsSearchSchema = createPaginationSearchSchema(20).extend({
    userId: z.string().uuid().optional(),
    shopId: z.string().uuid().optional(),
    status: CouponStatusSchema.optional(),
})
export type CouponOpsSearch = z.infer<typeof couponOpsSearchSchema>
