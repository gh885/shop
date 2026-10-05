import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { SellerCouponsApi, type CreateCouponTemplateRequest } from "@shop/api/sdk"

import type { CouponListSearch } from "./model"

/**
 * coupon 域 · TanStack Query 接线层：key 工厂 + 列表/建券/停券。
 *
 * 所有 key 集中在这里，失效范围一眼可见。shopId 进 key：切店铺不串缓存，
 * 失效也精确打在当前店铺那一棵树上（后端从 X-Shop-Id 取店，前端不传）。
 * shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入。
 */

const couponKeys = {
    all: ["coupons"] as const,
    lists: (shopId: string) => ["coupons", shopId] as const,
    list: (shopId: string, s: CouponListSearch) => ["coupons", shopId, s.page, s.size] as const,
}

/** 本店券模板分页列表（页面 useQuery 直用） */
export const couponListOptions = (shopId: string, search: CouponListSearch) =>
    queryOptions({
        queryKey: couponKeys.list(shopId, search),
        // 端点用店铺上下文取 shopId（传输层注入 X-Shop-Id），前端不传店 ID——
        // 传了就多一个能与登录态不一致的来源。权限由后端 COUPON_MANAGE 校验（403 归一成 ApiError）。
        queryFn: ({ signal }) =>
            SellerCouponsApi.listShopCoupons({
                query: { pageParams: { page: search.page, size: search.size } },
                signal,
            }),
        // 翻页时保留上一页数据，避免整表闪成骨架屏
        placeholderData: (prev) => prev,
        // 带 placeholderData（不能走 suspense），失败冒到路由错误页由全局默认接管
    })

/** 新建券：成功后失效本店列表（新建的券总在按创建时间倒序的第一页） */
export function useCreateCoupon(shopId: string) {
    return useMutation({
        // 金额入参是「分」
        mutationFn: (input: CreateCouponTemplateRequest) =>
            SellerCouponsApi.createCoupon({ body: input }),
        meta: {
            success: message("seller.coupon.toast.created"),
            invalidates: [couponKeys.lists(shopId)],
        },
    })
}

/** 停券：只停止继续领取，已领出的券不受影响 */
export function useStopCoupon(shopId: string) {
    return useMutation({
        // 只停止继续领取，已领出的券照旧可用
        mutationFn: (id: string) => SellerCouponsApi.stopCoupon({ path: { id } }),
        meta: {
            success: message("seller.coupon.toast.disabled"),
            invalidates: [couponKeys.lists(shopId)],
        },
    })
}
