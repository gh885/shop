import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { SellerCouponsApi, type CreateCouponTemplateRequest } from "@shop/api/sdk"
import type { CouponListSearch } from "./search"

// shopId 必须在 key 里：拿掉就切店串缓存（店 ID 后端从 X-Shop-Id 取，前端不显式传，传了就有第二个能与登录态不一致的来源）
const couponKeys = {
    all: ["coupons"] as const,
    lists: (shopId: string) => [...couponKeys.all, shopId] as const,
    list: (shopId: string, s: CouponListSearch) =>
        [...couponKeys.lists(shopId), s.page, s.size] as const,
}

export const couponListOptions = (shopId: string, search: CouponListSearch) =>
    queryOptions({
        queryKey: couponKeys.list(shopId, search),
        queryFn: ({ signal }) =>
            SellerCouponsApi.listShopCoupons({
                query: { pageParams: { page: search.page, size: search.size } },
                signal,
            }),
        placeholderData: (prev) => prev,
    })

export function useCreateCoupon(shopId: string) {
    return useMutation({
        // 金额入参是「分」
        mutationFn: (input: CreateCouponTemplateRequest) =>
            SellerCouponsApi.createCoupon({ body: input }),
        meta: {
            success: message("coupon.toast.created"),
            invalidates: [couponKeys.lists(shopId)],
        },
    })
}

export function useStopCoupon(shopId: string) {
    return useMutation({
        // 只停止继续领取，已领出的券照旧可用
        mutationFn: (id: string) => SellerCouponsApi.stopCoupon({ path: { id } }),
        meta: {
            success: message("coupon.toast.disabled"),
            invalidates: [couponKeys.lists(shopId)],
        },
    })
}
