import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"

import type { CreateCouponTemplateRequest } from "@shop/api/sdk"

import { useCurrentShop } from "#/shop"
import { useWriteMutation } from "@shop/app-kit"
import { createCoupon, listCoupons, stopCoupon } from "./data"
import type { CouponListSearch } from "./model"

/**
 * coupon 域 · TanStack Query 接线层：key 工厂 + 列表/建券/停券。
 *
 * 所有 key 集中在这里，失效范围一眼可见。shopId 进 key：切店铺不串缓存，
 * 失效也精确打在当前店铺那一棵树上（后端从 X-Shop-Id 取店，前端不传）。
 */

export const couponKeys = {
    all: ["coupons"] as const,
    lists: (shopId: string | undefined) => ["coupons", shopId] as const,
    list: (shopId: string | undefined, s: CouponListSearch) =>
        ["coupons", shopId, s.page, s.size] as const,
}

export const couponListOptions = (shopId: string | undefined, search: CouponListSearch) =>
    queryOptions({
        queryKey: couponKeys.list(shopId, search),
        queryFn: () => listCoupons(search.page, search.size),
        enabled: Boolean(shopId),
        // 翻页时保留上一页数据，避免整表闪成骨架屏
        placeholderData: (prev) => prev,
    })

/** 本店券模板分页列表 */
export function useCouponList(search: CouponListSearch) {
    const shop = useCurrentShop()
    const queryClient = useQueryClient()
    const shopId = shop?.id
    return {
        ...useQuery(couponListOptions(shopId, search)),
        /** 错误态重试：与建券/停券同一条失效入口 */
        onRetry: () => void queryClient.invalidateQueries({ queryKey: couponKeys.lists(shopId) }),
    }
}

/** 新建券：成功后失效本店列表（新建的券总在按创建时间倒序的第一页） */
export function useCreateCoupon() {
    const queryClient = useQueryClient()
    const shopId = useCurrentShop()?.id
    return useWriteMutation<CreateCouponTemplateRequest>({
        mutationFn: createCoupon,
        invalidate: () =>
            void queryClient.invalidateQueries({ queryKey: couponKeys.lists(shopId) }),
        messages: { success: "优惠券已创建，买家现在可以领取了" },
    })
}

/** 停券：只停止继续领取，已领出的券不受影响 */
export function useStopCoupon() {
    const queryClient = useQueryClient()
    const shopId = useCurrentShop()?.id
    return useWriteMutation<string>({
        mutationFn: stopCoupon,
        invalidate: () =>
            void queryClient.invalidateQueries({ queryKey: couponKeys.lists(shopId) }),
        messages: { success: "优惠券已停用" },
    })
}
