import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { getContext } from "./app/tanstack-query/root-provider"

export function getRouter() {
    const context = getContext()

    const router = createTanStackRouter({
        routeTree,
        context,
        scrollRestoration: true,
        // 悬停/聚焦即预取目标 route 的 loader；render 太激进（网格卡片会并发热拉），intent 是 feed 场景的正确默认
        defaultPreload: "intent",
        // 预取结果在会话内复用：同一次会话里再次 hover 同一链接不再重复拉（loader 数据通常 5min 才失效）
        defaultPreloadStaleTime: 5 * 60_000,
    })

    setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

    return router
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof getRouter>
    }
}
