import { Suspense, type ReactNode } from "react"
import { QueryErrorResetBoundary } from "@tanstack/react-query"
import { ErrorBoundary } from "react-error-boundary"

import { toApiError } from "@shop/common/contract"
import { type AppLocale } from "@shop/i18n"
import { StateError } from "@shop/ui-web"

import { errorText } from "../i18n/error-keys"
import { useI18n } from "../i18n/use-i18n"

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
 * - **用**：区块内的查询 —— 失败时整个区块替换为 fallback，页面其余部分照常渲染
 *   （商品详情的推荐流、店铺条…）。区块内的 suspense 查询直接生效（`useSuspenseQuery`
 *   自己会抛，并吃 `pending` 骨架）；非 suspense 查询靠全局默认的 `throwOnError` 抛到本组件
 *   的 `ErrorBoundary`，这种形态**不要传 `pending`**。
 * - **不用**：页面主体数据失败 —— 那是路由级 `errorComponent` 的职责（`defaultErrorComponent`
 *   已在三端 router 上配好），页面里不该再写 `isError` 分支。
 * - **也可能不用**：区块里的查询若已显式 `throwOnError: false` 退出全局默认（带 `enabled` /
 *   `placeholderData` / `skipToken` 的按需/降级读取），失败就不抛了 —— 那种形态就地渲染错误 UI
 *   并用官方 `refetch()` 重试（官方 manual 的写法），见 docs/conventions/frontend.md「错误与重试」。
 *
 * 注意 `reset` 的语义（官方实现）：它**不动缓存**，只清「错误已上报」的标记并放行下次挂载重取。
 * 因此如果失败原因需要连带刷新别的查询，那属于 mutation 之后的失效，写在 mutation 的
 * `invalidateKeys` 里，不要塞进这个 `reset`。
 */
interface QueryBoundaryProps {
    children: ReactNode
    /**
     * 失败态渲染：传字符串 = 默认渲染 StateError，取文案走 §7.3 那条链（登记码 → catalog，
     * 中文界面 → 后端 detail，其它语言拿不到 code → 站点这句）；字符串本身必须是
     * `t("…")` 取出来的目录句子，硬编码中文会把中文漏进英文界面。
     * 区块需要自定义布局（紧凑条/骨架同尺寸卡片）时传渲染函数。
     * `reset` 已接好官方重置链路，直接交给错误 UI 的重试按钮。
     */
    fallback: string | ((args: { error: unknown; reset: () => void }) => ReactNode)
    /** 挂起占位：仅当子树的查询是 suspense 变体时传入（区块级流式）；不传则不套 Suspense */
    pending?: ReactNode
}

/**
 * 失败面渲染：字符串 → 默认 StateError；函数 → 自定义布局。
 * 定义在模块作用域：在渲染期就地写这段 JSX 会被 react/no-unstable-nested-components 判成每次渲染新建组件。
 */
function renderFallback(
    fallback: QueryBoundaryProps["fallback"],
    error: unknown,
    reset: () => void,
    locale: AppLocale,
): ReactNode {
    if (typeof fallback === "string") {
        // 判据收在 app-kit 的 errorText（一处口径）：与全局 toast 同一条链，
        // 同一屏上不会出现「toast 说 catalog、区块说 detail」两种语感
        return (
            <StateError
                message={errorText(toApiError(error), locale, fallback)}
                onRetry={reset}
            />
        )
    }
    return fallback({ error, reset })
}

export function QueryBoundary({ children, fallback, pending }: QueryBoundaryProps) {
    const { locale } = useI18n()
    return (
        <QueryErrorResetBoundary>
            {({ reset }) => (
                <ErrorBoundary
                    onReset={reset}
                    fallbackRender={({ error, resetErrorBoundary }) =>
                        renderFallback(fallback, error, resetErrorBoundary, locale)
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
