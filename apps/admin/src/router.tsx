import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { captureError } from "@shop/common"
import { RoutePending } from "@shop/app-kit"

import { RouteError } from "./shared/ui/route-error"

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    /** 预取复用窗口，须 ≤ 底层 query 的 staleTime（推导见 apps/web/src/router.tsx 同名配置）；0 会让预取全部作废 */
    defaultPreloadStaleTime: 10_000,
    /** 每个 route match 的兜底错误页（叶子失败时侧边栏仍在），重试走官方双 reset */
    defaultErrorComponent: RouteError,
    /** 兜底挂起骨架：库在没有 pendingComponent 时默认渲染 null（漏写即静默白屏，详见 app-kit RoutePending） */
    defaultPendingComponent: RoutePending,
    /**
     * 渲染期未捕获错误的遥测出口。
     *
     * 与 web / seller 的 defaultOnCatch 同一个出口（@shop/common 的 captureError）：三端不各写一份
     * 上报逻辑，否则换监控后端要改三处、且总有一端会漏。UI 反馈仍由 defaultErrorComponent 负责。
     */
    defaultOnCatch: (error) => captureError("route_error", error),
})
// PV 上报在 mountSpa 里（spa-entry.tsx，与 seller 同源）

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}
