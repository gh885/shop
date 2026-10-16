import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { captureError } from "@shop/monitoring"
import { RoutePending } from "@shop/app-kit/shell"
import { RouteError } from "./shared/ui/RouteError"

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // 预取复用窗口必须 ≤ 底层 query 的 staleTime，否则会跳过 loader、把过期快照当新数据渲染（推导见 apps/web/src/router.tsx）
    defaultPreloadStaleTime: 10_000,
    defaultErrorComponent: RouteError,
    // 库在没有 pendingComponent 时默认渲染 null，漏写即静默白屏（详见 app-kit RoutePending）
    defaultPendingComponent: RoutePending,
    defaultOnCatch: (error) => captureError("route_error", error),
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}
