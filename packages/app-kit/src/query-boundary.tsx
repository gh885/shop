import { Suspense, type ReactNode } from "react"
import { QueryErrorResetBoundary } from "@tanstack/react-query"
import { ErrorBoundary } from "react-error-boundary"

/**
 * 区块级「挂起 + 失败」边界 —— **官方三件套的组合，不是替代品**：
 * `QueryErrorResetBoundary`（Query）+ `ErrorBoundary`（react-error-boundary，官方文档示例同款）
 *  + 可选 `Suspense`。
 *
 * 为什么需要它：TanStack Query 官方的错误恢复协议是「查询抛错 → 错误边界接住 → 边界的
 * `onReset` 调 `QueryErrorResetBoundary` 的 `reset` → 重挂载后查询重新取数」。手写这段
 * 组合（`onReset` 接线、`resetErrorBoundary` 转交）每个区块抄一遍必然漂移，所以收成一处。
 *
 * 何时用它，何时不用：
 * - **用**：区块内的查询走 suspense 变体（`useSuspenseQuery`）或显式 `throwOnError`，
 *   失败时整个区块替换为 fallback，页面其余部分照常渲染（商品详情的推荐流、店铺条…）。
 * - **不用**：页面主体数据失败 —— 那是路由级 `errorComponent` 的职责（`defaultErrorComponent`
 *   已在三端 router 上配好），页面里不该再写 `isError` 分支。
 * - **也不用**：查询带 `enabled` / `placeholderData` / `skipToken`（suspense 不支持这三者）——
 *   这类失败不会抛错，按官方 manual 重试用 result 的 `refetch()` 就地渲染。
 *
 * 注意 `reset` 的语义（官方实现）：它**不动缓存**，只清「错误已上报」的标记并放行下次挂载重取。
 * 因此如果失败原因需要连带刷新别的查询，那属于 mutation 之后的失效，写在 mutation 的
 * `invalidateKeys` 里，不要塞进这个 `reset`。
 */
export interface QueryBoundaryProps {
    children: ReactNode
    /** 失败态渲染；`reset` 已接好官方重置链路，直接交给错误 UI 的重试按钮 */
    fallback: (args: { error: unknown; reset: () => void }) => ReactNode
    /** 挂起占位：仅当子树的查询是 suspense 变体时传入（区块级流式）；不传则不套 Suspense */
    pending?: ReactNode
}

export function QueryBoundary({ children, fallback, pending }: QueryBoundaryProps) {
    return (
        <QueryErrorResetBoundary>
            {({ reset }) => (
                <ErrorBoundary
                    onReset={reset}
                    fallbackRender={({ error, resetErrorBoundary }) =>
                        fallback({ error, reset: resetErrorBoundary })
                    }
                >
                    {pending === undefined ? (
                        children
                    ) : (
                        <Suspense fallback={pending}>{children}</Suspense>
                    )}
                </ErrorBoundary>
            )}
        </QueryErrorResetBoundary>
    )
}
