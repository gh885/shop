import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { captureError } from "@shop/monitoring"
import { RoutePending } from "@shop/app-kit/shell"
import { RouteError } from "./shared/ui/route-error"

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // 预取复用窗口，须 ≤ 底层 query 的 staleTime；0 会让预取全部作废
    defaultPreloadStaleTime: 10_000,
    defaultErrorComponent: RouteError,
    // 库在没有 pendingComponent 时默认渲染 null：漏写这一行就静默白屏
    defaultPendingComponent: RoutePending,
    defaultOnCatch: (error) => captureError("route_error", error),
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}
