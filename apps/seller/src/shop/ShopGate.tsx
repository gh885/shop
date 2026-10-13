import type { ReactNode } from "react"
import { Navigate, useChildMatches } from "@tanstack/react-router"

import { Skeleton } from "@shop/ui-web"

import { useSessionKind } from "#/shared/lib/session-kind"
import { useShopContext } from "./queries"
import { ShopProvider } from "./shop-context"

/** 无 ACTIVE 店铺时仍允许访问的路由：目前只有「店铺管理 / 开店引导」 */
const ALLOWED_WITHOUT_SHOP = new Set(["/shop/list"])

/**
 * **店主专属**的页面：子账号进去只会拿到后端 403（子账号管理由 `ShopService.requireOwner` 把关），
 * 而侧栏对两种会话画的是同一份菜单。所以这类页面在守卫里对子账号统一送回工作台首屏——
 * 与 `/shop/list` 同一处置，理由也一样：一个不属于自己的入口，点了就该有明确结果。
 *
 * 这里**只有**「按身份就不该进」的页；「按权限码不该进」的页（商品 / 订单 / 券 …）不在内——
 * 那要按 `permissions` 裁导航，本期没做（子账号点进去会落到路由错误页的 403）。
 */
const OWNER_ONLY_PATHS = new Set([...ALLOWED_WITHOUT_SHOP, "/shop/member"])

/**
 * 路由级店铺守卫（挂在 /_app 布局）：把「无 ACTIVE 店铺」收敛到这里，业务页面不再各自兜底。
 *
 * 时序：
 * 1. 店铺数据未就绪 → 整页骨架（不能渲染「无店」——两种会话的首帧都还没拿到店，
 *    直接放行/重定向会闪跳）；
 * 2. 数据就绪且有店 → 经 ShopProvider 注入当前店后放行（子树内 useShop 保证非空）；
 * 3. 数据就绪但无店 → 只放行豁免路由（开店引导），其余重定向过去。
 *
 * 豁免是**店主专属**的：`/shop/list` 画的是「我的店铺列表」，而子账号没有可挑的店
 * （它的店由令牌带来），所以那一页对子账号既不成立、也没有能展示的数据。
 *
 * 前提：/_app 的 beforeLoad requireAuth 已保证登录，取数请求的 enabled 恒真。
 */
export function ShopGate({ children }: { children: ReactNode }) {
    const subaccount = useSessionKind() === "subaccount"
    // location 已指向目标时，Outlet 仍可能保留旧页面。只按实际渲染的子 match 放行，
    // 否则跳往店铺管理时会把商品页放出守卫，却不给它 ShopProvider。
    const allowedWithoutShop = useChildMatches({
        select: (matches) => matches.some((match) => ALLOWED_WITHOUT_SHOP.has(match.pathname)),
    })
    // 子账号要挡的那几页：含「我的店铺列表」（它没有可挑的店）与店主专属页
    const ownerOnlyPath = useChildMatches({
        select: (matches) => matches.some((match) => OWNER_ONLY_PATHS.has(match.pathname)),
    })
    const { shop, isPending } = useShopContext()

    // 店铺列表失败不在这里渲染错误态：全局默认的 `throwOnError` 已把它抛给路由级错误页
    // （官方边界 + 重置重试），这层只负责「未就绪 → 骨架」「有店 → 放行」「无店 → 引导」。
    if (isPending) {
        return (
            <div className="mx-auto w-full max-w-3xl space-y-3 p-6">
                {[0, 1, 2].map((i) => (
                    <Skeleton
                        key={i}
                        className="h-16 w-full rounded-lg"
                    />
                ))}
            </div>
        )
    }
    // 子账号误入店主专属页（侧栏仍画着这些入口）：它们的取数必然 403 / 空白，
    // 所以送回工作台首屏，而不是让用户对着一个不属于自己的入口点下去
    if (subaccount && ownerOnlyPath) {
        return (
            <Navigate
                to="/"
                replace
            />
        )
    }
    if (shop) {
        return <ShopProvider shop={shop}>{children}</ShopProvider>
    }
    if (allowedWithoutShop && !subaccount) {
        return children
    }
    return (
        <Navigate
            to="/shop/list"
            replace
        />
    )
}
