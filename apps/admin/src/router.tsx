import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { RouteError } from "./shared/ui/RouteError"

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    /** 每个 route match 的兜底错误页（叶子失败时侧边栏仍在），重试走官方双 reset */
    defaultErrorComponent: RouteError,
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}
