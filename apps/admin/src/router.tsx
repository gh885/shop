import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { RouteError } from "./shared/ui/route-error"

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    /** 预取复用窗口，须 ≤ 底层 query 的 staleTime（推导见 apps/web/src/router.tsx 同名配置）；0 会让预取全部作废 */
    defaultPreloadStaleTime: 10_000,
    /** 每个 route match 的兜底错误页（叶子失败时侧边栏仍在），重试走官方双 reset */
    defaultErrorComponent: RouteError,
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}
