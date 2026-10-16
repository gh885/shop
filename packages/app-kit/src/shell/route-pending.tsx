import { Skeleton } from "@shop/ui-web"

/**
 * pendingComponent 缺位时的三端共用兜底：不写它时客户端导航期间旧页静默停留、无加载反馈，这里渲染中性骨架（块级中性、不假设占满整屏）。
 * 页面级仍应自写 pendingComponent（按真实形状排、避免 CLS）；Router 优先取 route 上的，两者不冲突。
 */
export function RoutePending() {
    return (
        <div
            aria-hidden="true"
            className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16"
        >
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
        </div>
    )
}
