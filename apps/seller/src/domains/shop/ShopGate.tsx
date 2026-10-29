import type { ReactNode } from "react"
import { Skeleton } from "@shop/ui-web"

import { useShopContext } from "./queries"
import { ShopProvider } from "./shop-context"

/**
 * 店铺守卫。一家店一个账号——新后端没有多店切换与子账号，
 * 所以这里只剩两种状态：身份与店铺还没取到（骨架）、取到了（注入上下文）。
 *
 * <p>入驻不在这里拦：注册即时成立身份与店铺，审核状态只是横幅（{@link OnboardingBanner}）——
 * 审核期能登录能逛，只有发布被治理侧挡着，把人锁在门外没有意义。
 * 账号名下没有启用中的店（关店终态或种子账号）才退到提示页。
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
