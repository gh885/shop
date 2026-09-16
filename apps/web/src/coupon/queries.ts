import { CouponsApi, type ClaimableCouponResponse } from "@shop/api/sdk"
import { notify } from "@shop/app-kit"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
    COUPON_PAGE_SIZE,
    isCouponAlreadyClaimed,
    toMyCoupon,
    type CouponTab,
    type MyCoupon,
} from "./coupon"

/**
 * coupon/queries —— 优惠券的数据层（fetch 纯函数 + queryOptions + hooks）。
 * 规则/类型在 ./coupon.ts（投影与纯派生）。
 *
 * 券包是受保护路由（_protected layout 保证挂载时必已登录）；店铺可领券是匿名端点（`/api/*`），
 * 两端都不进 route loader —— 领券入口在商品详情页，SSR 阶段多打一个接口只为渲染一个按钮不划算。
 */

// ---------- 我的券包 ----------

/** 券包缓存前缀：状态页签 × 分页都是同一份数据的切片，失效一发命中整棵子树 */
export const MY_COUPONS_KEY = ["my-coupons"] as const

/** 我的券包 queryOptions：queryKey 带全部分页/筛选入参，切页签与翻页各占一格缓存；
 *  导出供 route loader 客户端预热（券包页 loader 预取默认页签第一页） */
export const myCouponsOptions = (status: CouponTab, page: number) =>
    queryOptions({
        queryKey: [...MY_COUPONS_KEY, status, page, COUPON_PAGE_SIZE],
        queryFn: async ({ signal }): Promise<{ records: MyCoupon[]; total: number }> => {
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
        // 切页签/翻页保留上一份数据（isPlaceholderData），不重放 Skeleton
        placeholderData: (prev) => prev,
    })

/** 我的券包（当前页签 + 页码） */
export function useMyCoupons(status: CouponTab, page = 1) {
    return useQuery(myCouponsOptions(status, page))
}

// ---------- 店铺可领券（匿名） ----------

export const SHOP_CLAIMABLE_COUPONS_KEY = ["shop-claimable-coupons"] as const

const shopClaimableCouponsOptions = (shopId: string) =>
    queryOptions({
        queryKey: [...SHOP_CLAIMABLE_COUPONS_KEY, shopId],
        queryFn: async ({ signal }): Promise<ClaimableCouponResponse[]> => {
            return await CouponsApi.listShopClaimableCoupons({
                path: { shopId },
                signal,
            })
        },
        staleTime: 60_000,
        // 领券入口是页面的附属件：拉失败就不给入口（不报警、不占位）。但**必须留默认重试**——
        // 一次瞬时抖动配上 60s 的 staleTime，等于让入口从现在起长时间消失，用户既看不到失败也无处重试。
    })

/** 某店当前可领的券（先到先得，soldOut 由后端闸门算） */
export function useShopClaimableCoupons(shopId: string) {
    return useQuery(shopClaimableCouponsOptions(shopId))
}

// ---------- 领券 ----------

/**
 * 领券。
 *
 * - 成功：toast + 失效整棵券包缓存（券包页可能正开着，回来后必须看得到这张新券）。
 * - 409 `COUPON_ALREADY_CLAIMED`：不是失败，提示「已领取」即可 —— 券在券包里，
 *   说「领取失败」会让用户以为没领到而反复点。
 * - 其余错误：走 notify.fromError 的后端 detail 优先策略。
 *
 * 「把这张券就地标记为已领」是入口浮层的局部状态（可领券响应刻意不带「我领过没」，
 * 匿名通道拿不到当前用户），由调用方在 mutate 的回调里落，本 hook 不管 UI。
 */
export function useClaimCoupon() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (templateId: string) => CouponsApi.claimCoupon({ path: { templateId } }),
        onSuccess: () => {
            notify.success("领取成功，已放入券包")
            void queryClient.invalidateQueries({ queryKey: MY_COUPONS_KEY })
        },
        onError: (err) => {
            if (isCouponAlreadyClaimed(err)) notify.info("该券已领取")
            else notify.fromError(err, "领取失败")
        },
    })
}
