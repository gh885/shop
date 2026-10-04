import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query"
import { RouterProvider, type AnyRouter } from "@tanstack/react-router"

import type { I18nInstance } from "@shop/common/i18n"
import { I18nProvider } from "../i18n"
import { createAppQueryClient } from "../data/query-client"
import { bindNotifyI18n } from "../data/notify"
import { trackRouteResolved } from "./route-tracking"

export interface MountSpaOptions {
    i18n: I18nInstance
}

/**
 * SPA 入口的公共本体（seller/admin 共用；web 是 SSR，不走这里）。
 *
 * 默认值（staleTime 兜底等）唯一真相源在 createAppQueryClient：三端必须一致，
 * 否则「忘写 staleTime 的查询」在这里会 mount 即重拉，在 web 却不会。
 * 官方重置链路：路由级/区块级错误页的重试都要靠 QueryErrorResetBoundary 清「错误已上报」标记。
 * 各 app 的 main.tsx 只剩三行：引 router、引样式、mount。
 */
export function mountSpa(router: AnyRouter, options: MountSpaOptions) {
    const queryClient = createAppQueryClient(options.i18n)
    // notify 与 queryClient 共用同一份实例：直接 notify 的异步路径由此在弹出时刻现读当前语言（§7.1）
    bindNotifyI18n(options.i18n)

    // PV 上报：与 web 同一份接线（route-tracking.ts），模板化口径三端必须一致
    trackRouteResolved(router)

    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <QueryErrorResetBoundary>
                    <I18nProvider i18n={options.i18n}>
                        <RouterProvider router={router} />
                    </I18nProvider>
                </QueryErrorResetBoundary>
            </QueryClientProvider>
        </StrictMode>,
    )
}
