import { AdminCouponsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { CouponOpsSearch } from "./search"

export const couponOpsKeys = {
    all: ["coupon-ops"] as const,
    list: (input: CouponOpsSearch) => [...couponOpsKeys.all, input] as const,
}

export const adminCouponListOptions = (input: CouponOpsSearch) =>
    queryOptions({
        queryKey: couponOpsKeys.list(input),
        queryFn: async ({ signal }) => {
            const result = await AdminCouponsApi.listAdminCoupons({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: {
                        userId: input.userId,
                        shopId: input.shopId,
                        status: input.status,
                    },
                },
                signal,
            })
            return { records: result.records, total: result.total }
        },
        placeholderData: (previous) => previous,
    })
