import { AdminCouponsApi } from "@shop/api/sdk"
import { type AdminCouponStatus } from "./constants"
import { queryOptions } from "@tanstack/react-query"

export const couponOpsKeys = {
    all: ["admin", "coupon-ops"] as const,
    list: (input: {
        userId?: string
        shopId?: string
        status?: AdminCouponStatus
        page: number
        size: number
    }) =>
        [
            "admin",
            "coupon-ops",
            input.userId ?? "",
            input.shopId ?? "",
            input.status ?? "all",
            input.page,
            input.size,
        ] as const,
}

export const adminCouponListOptions = (input: {
    userId?: string
    shopId?: string
    status?: AdminCouponStatus
    page: number
    size: number
}) =>
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
