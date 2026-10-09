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

/**
 * coupon/queries —— 优惠券的数据层（fetch 纯函数 + queryOptions + hooks）。
 * 规则/类型在 ./coupon.ts（纯派生），wire 投影在 ./mapper.ts。
 *
 * 券包是受保护路由（_protected layout 保证挂载时必已登录）；店铺可领券是匿名端点（`/api/*`），
 * 两端都不进 route loader —— 领券入口在商品详情页，SSR 阶段多打一个接口只为渲染一个按钮不划算。
 */

// 我的券包
/** 券包缓存前缀：状态页签 × 分页都是同一份数据的切片，失效一发命中整棵子树。
 *  导出给**跨域**失效用（下单会核销券，checkout 的 useCreateOrder 要失效它）：
 *  invalidates 传真实 key，不导出就只能在外域抄一遍字面量，那等于第二棵 key 树。 */
export const MY_COUPONS_KEY = ["my-coupons"] as const

/** 我的券包 queryOptions：queryKey 带全部分页/筛选入参，切页签与翻页各占一格缓存；
 *  导出供 route loader 客户端预热（券包页 loader 预取默认页签第一页）；
 *  组件直接 `useQuery(myCouponsOptions(tab, page))`，不为它再包一层同名 hook */
export const myCouponsOptions = (status: CouponTab, page: number) =>
    queryOptions({
        queryKey: [...MY_COUPONS_KEY, status, page, COUPON_PAGE_SIZE],
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
        // 切页签/翻页保留上一份数据（isPlaceholderData），不重放 Skeleton
        placeholderData: (prev) => prev,
        // 带 placeholderData 的列表不进 suspense；失败冒到路由错误页由全局默认 throwOnError 接管
    })

// 店铺可领券（匿名）
const SHOP_CLAIMABLE_COUPONS_KEY = ["shop-claimable-coupons"] as const

/** 某店当前可领的券（先到先得，soldOut 由后端闸门算；未到发放起点的券也在列表里，claimable=false）；
 *  组件直接 useQuery(shopClaimableCouponsOptions(shopId)) */
export const shopClaimableCouponsOptions = (shopId: string) =>
    queryOptions({
        queryKey: [...SHOP_CLAIMABLE_COUPONS_KEY, shopId],
        queryFn: async ({ signal }): Promise<ClaimableCoupon[]> => {
            const coupons = await CouponsApi.listShopClaimableCoupons({
                path: { shopId },
                signal,
            })
            return coupons.map(toClaimableCoupon)
        },
        staleTime: 60_000,
        // 领券入口是页面的附属件：拉失败就不给入口（不报警、不占位）。但**必须留默认重试**——
        // 一次瞬时抖动配上 60s 的 staleTime，等于让入口从现在起长时间消失，用户既看不到失败也无处重试。
        // 退出全局的「失败抛给错误边界」：入口浮层头上没有边界，抛出去会把商品详情整页换成错误页
        throwOnError: false,
    })

// 领券
/**
 * 领券。
 *
 * - 成功：toast + 失效整棵券包缓存（券包页可能正开着，回来后必须看得到这张新券）。
 * - 409 `COUPON_ALREADY_CLAIMED`：不是失败，提示「已领取」即可 —— 券在券包里，
 *   说「领取失败」会让用户以为没领到而反复点。
 * - 其余错误：走 notify.fromError 的后端 detail 优先策略。
 *
 * `silentError` 是这条链路的关键：全局反馈先于逐点 `onError` 执行，不退出的活 409 会先被全局
 * 按 detail 弹一条「该优惠券已领取」的**错误** toast，紧接着本 hook 再弹一条「该券已领取」——
 * 同一件事两条互相覆盖的提示。退出后由本 hook 按 code 全权裁决。
 *
 * 「把这张券就地标记为已领」是入口浮层的局部状态（可领券响应刻意不带「我领过没」，
 * 匿名通道拿不到当前用户），由调用方在 mutate 的回调里落，本 hook 不管 UI。
 */
export function useClaimCoupon() {
    return useMutation({
        mutationFn: (templateId: string) => CouponsApi.claimCoupon({ path: { templateId } }),
        meta: {
            success: message("coupon.toast.claimSuccess"),
            invalidates: [MY_COUPONS_KEY],
            silentError: true,
        },
        // 409 不是失败：券已在券包里，说「领取失败」会让用户反复点
        onError: (err) => {
            // 不传 locale：交给 notify 按注入实例现读「完成时的语言」，别用渲染期捕获的旧语言
            if (isCouponAlreadyClaimed(err)) notify.info(message("coupon.toast.alreadyClaimed"))
            else notify.fromError(err, undefined, message("coupon.toast.claimFailed"))
        },
    })
}
