import { bindRouterI18n } from "#/app/i18n-router"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { getContext } from "#/app/tanstack-query/TanstackQueryProvider"
import { RoutePending } from "@shop/app-kit/shell"
import { RouteError } from "#/shared/ui/RouteError"
import { SITE_ORIGIN } from "#/shared/lib/env"
import { reportError } from "#/shared/lib/report-error"

export function getRouter() {
    const context = getContext()

    const router = createTanStackRouter({
        routeTree,
        context,
        // SSR 解析绝对 URL（canonical/og:url、redirect 的 Location）的基准。
        // 不配的话服务端回退成 http://localhost，绝对 URL 会把 localhost 写进 meta
        origin: SITE_ORIGIN,
        scrollRestoration: true,
        // 悬停/聚焦即预取目标 route 的 loader；render 太激进（网格卡片会并发热拉），intent 是 feed 场景的正确默认
        defaultPreload: "intent",
        /**
         * 预取结果的复用窗口。注意这**不是**「数据多久失效」——那由各 queryOptions 的 staleTime 决定。
         * 本项目 route loader 一律经 Query 缓存取数（queryClient.query(...)，没有裸 fetch），
         * 所以「重跑 loader」只是一次缓存读取；预取真正的收益是把数据灌进 Query 缓存，与本值无关。
         *
         * 本值控的是「预取过的路由多久内跳过 loader 重执行」，因此必须 ≤ 底层 query 的 staleTime：
         * 一旦更大，导航就会跳过 loader、把已过期的预取快照当新数据渲染（不报错，只是数据静默变旧）。
         * 取现有最小一档（购物车/券/收藏 30s）为上限，既守住不变式又不损失预取收益。
         */
        defaultPreloadStaleTime: 30_000,
        /**
         * 同一条 route 换 params（/products/1 → /products/2）默认**不重挂载**组件，React 复用同一实例，
         * 本地 state 会跨「记录」残留：详情的数量步进器、画廊当前图、锚点位置都会带到下一个商品。
         * 语义上换了实体就是新页面，按 params 重挂载。
         */
        defaultRemountDeps: ({ params }) => params,
        /**
         * 每个 route match 的兜底错误页：路由渲染/loader 抛错时渲染在**该 match 的位置**，
         * 所以叶子路由失败时导航壳仍在（不再整页白屏）。叶子要自己的错误 UI 就配 `errorComponent` 覆盖。
         * 重试由 RouteError 内的官方双 reset（Router reset + QueryErrorResetBoundary reset）完成。
         */
        defaultErrorComponent: RouteError,
        /**
         * 兜底挂起骨架：库在没有 pendingComponent 时的默认行为是**渲染 null**（详见 app-kit
         * RoutePending 的注释）。页面级 pending 仍应各自按真实形状写 pendingComponent；
         * 这里只把「漏写」的后果从静默白屏降级成中性骨架。
         */
        defaultPendingComponent: RoutePending,
        // 渲染期未捕获错误的遥测出口（UI 反馈由各路由的 errorComponent 负责）
        defaultOnCatch: reportError,
    })

    if (!import.meta.env.SSR) {
        const unbind = bindRouterI18n(router, context.i18n)
        if (import.meta.hot) import.meta.hot.dispose(unbind)
    }

    setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

    return router
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof getRouter>
    }
}
