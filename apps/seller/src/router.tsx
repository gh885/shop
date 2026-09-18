import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { RouteError } from "./shared/ui/RouteError"

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    /**
     * 每个 route match 的兜底错误页：页面抛错时渲染在该 match 的位置，
     * 叶子路由失败时工作台布局（侧边栏/顶栏）仍在。重试走 RouteError 的官方双 reset。
     */
    defaultErrorComponent: RouteError,
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}
