import { message } from "#/locales/message"
import { CouponsApi } from "@shop/api/sdk"
import { notify } from "@shop/app-kit/data"
import { queryOptions, useMutation } from "@tanstack/react-query"

import {
    COUPON_PAGE_SIZE,
    isCouponAlreadyClaimed,
    type ClaimableCoupon,
    type CouponTab,
} from "./coupon"
import { toClaimableCoupon, toMyCoupon } from "./mapper"

export const couponKeys = {
    mine: ["my-coupons"] as const,
    myCoupons: (status: CouponTab, page: number) => ["my-coupons", status, page] as const,
    claimable: (shopId: string) => ["shop-claimable-coupons", shopId] as const,
}

export const myCouponsOptions = (status: CouponTab, page: number) =>
    queryOptions({
        queryKey: couponKeys.myCoupons(status, page),
        queryFn: async ({ signal }) => {
            const result = await CouponsApi.listMyCoupons({
                query: {
                    pageParams: { page, size: COUPON_PAGE_SIZE },
                    query: { status },
                },
                signal,
            })
            return { records: result.records.map(toMyCoupon), total: result.total }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })

export const shopClaimableCouponsOptions = (shopId: string) =>
    queryOptions({
        queryKey: couponKeys.claimable(shopId),
        queryFn: async ({ signal }): Promise<ClaimableCoupon[]> => {
            const coupons = await CouponsApi.listShopClaimableCoupons({
                path: { shopId },
                signal,
            })
            return coupons.map(toClaimableCoupon)
        },
        staleTime: 60_000,
        throwOnError: false,
    })

export function useClaimCoupon() {
    return useMutation({
        mutationFn: (templateId: string) => CouponsApi.claimCoupon({ path: { templateId } }),
        meta: {
            success: message("coupon.toast.claimSuccess"),
            invalidates: [couponKeys.mine],
            silentError: true,
        },
        onError: (err) => {
            if (isCouponAlreadyClaimed(err)) notify.info(message("coupon.toast.alreadyClaimed"))
            else notify.fromError(err, undefined, message("coupon.toast.claimFailed"))
        },
    })
}
