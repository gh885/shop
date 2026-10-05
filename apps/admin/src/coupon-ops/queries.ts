import { AdminCouponsApi } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { USER_COUPON_STATUSES } from "@shop/common/domain"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

/**
 * 状态筛选值进 URL：取值以 @shop/common 那条码表为准，不在这里再列一遍码。
 * 它只被下面那份 search schema 读，所以住这里，不进 `constants.ts`（那个文件只放展示常量）。
 */
const CouponStatusSchema = z.enum(USER_COUPON_STATUSES)

/** 券运营列表的 URL search：路由校验、页面、取数共用这一份形状 */
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
