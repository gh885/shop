import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { RouteError } from "./shared/ui/RouteError"

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    /**
     * 预取结果的复用窗口，必须 ≤ 底层 query 的 staleTime（不变式与推导见
     * apps/web/src/router.tsx 的同名配置）：更大就会跳过 loader、把已过期快照当新数据渲染。
     * 设 0 等于让每次悬停预取全部作废——hover 后导航必然重跑一遍 loader，白打一次后端。
     */
    defaultPreloadStaleTime: 10_000,
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
