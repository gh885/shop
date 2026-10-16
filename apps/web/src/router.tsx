import { createLocaleRewrite } from "#/shared/lib/locale-url"
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
        rewrite: createLocaleRewrite(context.locale, SITE_ORIGIN),
        origin: SITE_ORIGIN,
        scrollRestoration: true,
        defaultPreload: "intent",
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
