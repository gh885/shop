import type { ReactNode } from "react"
import { Skeleton } from "@shop/ui-web"

import { useShopContext } from "./queries"
import { ShopProvider } from "./shop-context"

/**
 * 店铺守卫。一家店一个账号——新后端没有多店切换与子账号，
 * 所以这里只剩两种状态：身份与店铺还没取到（骨架）、取到了（注入上下文）。
 *
 * <p>账号名下没有启用中的店时不渲染业务页：`/api/seller/me` 的 shopId 为 null，
 * 说明这个账号还没开店，页面本身没有可操作的数据。
 */
export function ShopGate({ children }: { children: ReactNode }) {
    const { shop, isPending } = useShopContext()

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
    if (shop) {
        return <ShopProvider shop={shop}>{children}</ShopProvider>
    }
    return (
        <div className="mx-auto w-full max-w-md p-10 text-center text-sm text-muted-foreground">
            当前账号名下还没有启用中的店铺，请联系平台开通。
        </div>
    )
}
