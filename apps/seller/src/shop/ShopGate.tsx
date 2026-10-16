import type { ReactNode } from "react"
import { Navigate, useChildMatches } from "@tanstack/react-router"

import { Skeleton } from "@shop/ui-web"

import { useSessionKind } from "#/shared/lib/session-kind"
import { useShopContext } from "./queries"
import { ShopProvider } from "./shop-context"

const ALLOWED_WITHOUT_SHOP = new Set(["/shop/list"])

// 这里只放「按身份就不该进」的页；「按权限码不该进」的页（商品/订单/券…）不在内——那按 permissions 裁导航，本期没做
const OWNER_ONLY_PATHS = new Set([...ALLOWED_WITHOUT_SHOP, "/shop/member"])

export function ShopGate({ children }: { children: ReactNode }) {
    const subaccount = useSessionKind() === "subaccount"
    // 只按实际渲染的子 match 放行；location 已指向目标时 Outlet 仍可能保留旧页面，会放出无 ShopProvider 的商品页
    const allowedWithoutShop = useChildMatches({
        select: (matches) => matches.some((match) => ALLOWED_WITHOUT_SHOP.has(match.pathname)),
    })
    const ownerOnlyPath = useChildMatches({
        select: (matches) => matches.some((match) => OWNER_ONLY_PATHS.has(match.pathname)),
    })
    const { shop, isPending } = useShopContext()

    // 店铺列表失败不在这里渲染错误态：全局 throwOnError 已抛给路由错误页，这层只负责三种状态
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
    // 子账号误入店主专属页（侧栏仍画着这些入口）：取数必然 403/空白，送回工作台首屏
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
