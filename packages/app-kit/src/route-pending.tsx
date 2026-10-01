import { Skeleton } from "@shop/ui-web"

/**
 * 路由级 pending 的兜底 —— 实现 TanStack Router 的 `pendingComponent` 契约，三端共用。
 *
 * 为什么需要它（存在的理由要看库的两处真实行为，`@tanstack/react-router` 的 Match.js + router-core的 load-client.js）：
 *
 * 1. 挂起只在「有 pendingComponent」时才会被呈现：`offerPending` 里`component` 为空就直接 return，
 *    连计时器都不启动；`MatchInner` 遇到 pending match 时，`router._tx[5]`（要抛给 Suspense 的那个元素）
 *    因此永远没被设置 → 渲染 `renderPending()` 的null。客户端导航时表现为**旧页继续停留**（不至于白屏），
 *    但用户在整个挂起窗口里**拿不到任何加载反馈**；首屏（SSR）走另一分支直接渲染组件，不受影响。
 * 2. 呈现还要过 `pendingMs` 一关（默认 1000ms，见 router-core的 defaultPendingMs），太快的请求本来就不闪骨架。
 *
 * 所以这道兜底把「漏写 pendingComponent」的代价从「导航期间旧页静默停留、无加载反馈」降到「渲染一个中性骨架」——
 * 形状与内容都不指涉具体页面（它不知道自己在给哪一页兜底），
 * 与 `RouteErrorFallback` 同一取舍：块级中性、不假设自己占满整屏（叶子 match 挂起时父级布局仍在）。
 *
 * 页面级 pending 仍然应该自己写 `pendingComponent`（骨架按该页真实形状排，避免 CLS）——
 * 本组件只在**没写**的时候出现。两者不冲突：Router 优先取 route 上的 pendingComponent。
 */
export function RoutePending() {
    return (
        <div
            aria-hidden="true"
            className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16"
        >
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
        </div>
    )
}
