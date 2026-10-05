import type { ReactNode } from "react"
import { Navigate, useChildMatches } from "@tanstack/react-router"

import { Skeleton } from "@shop/ui-web"

import { useCurrentShop, useMyShops } from "./queries"
import { ShopProvider } from "./shop-context"

/** 无 ACTIVE 店铺时仍允许访问的路由：目前只有「店铺管理 / 开店引导」 */
const ALLOWED_WITHOUT_SHOP = new Set(["/shop/list"])

/**
 * 路由级店铺守卫（挂在 /_app 布局）：把「无 ACTIVE 店铺」收敛到这里，业务页面不再各自兜底。
 *
 * 时序：
 * 1. 店铺数据未就绪 → 整页骨架（不能渲染「无店」——useMyShops 首次渲染必是空，直接放行/重定向会闪跳）；
 * 2. 数据就绪且有 ACTIVE 店铺 → 经 ShopProvider 注入当前店后放行（子树内 useShop 保证非空）；
 * 3. 数据就绪但无 ACTIVE 店铺 → 只放行豁免路由（开店引导），其余重定向过去。
 *
 * 前提：/_app 的 beforeLoad requireAuth 已保证登录，useMyShops 的 enabled 恒真。
 */
export function ShopGate({ children }: { children: ReactNode }) {
    // location 已指向目标时，Outlet 仍可能保留旧页面。只按实际渲染的子 match 放行，
    // 否则跳往店铺管理时会把商品页放出守卫，却不给它 ShopProvider。
    const allowedWithoutShop = useChildMatches({
        select: (matches) => matches.some((match) => ALLOWED_WITHOUT_SHOP.has(match.pathname)),
    })
    const shops = useMyShops()
    const shop = useCurrentShop()

    // 店铺列表失败不在这里渲染错误态：全局默认的 `throwOnError` 已把它抛给路由级错误页
    // （官方边界 + 重置重试），这层只负责「未就绪 → 骨架」「有店 → 放行」「无店 → 引导」。
    // 店铺数据未就绪：整页骨架（不能渲染「无店」——useMyShops 首次渲染必是空，直接放行/重定向会闪跳）。
    // 守卫在 requireAuth 之后渲染（enabled 恒真），isPending 即 isLoading，只查 isPending 即可。
    if (shops.isPending) {
        return (
            <div className="mx-auto w-full max-w-3xl space-y-3 p-6">
                {[0, 1, 2].map((i) => (
                    <Skeleton
                        key={i}
                        className="h-16 w-full rounded-xl"
                    />
                ))}
            </div>
        )
    }
    if (shop) {
        return <ShopProvider shop={shop}>{children}</ShopProvider>
    }
    if (allowedWithoutShop) {
        return children
    }
    return (
        <Navigate
            to="/shop/list"
            replace
        />
    )
}
