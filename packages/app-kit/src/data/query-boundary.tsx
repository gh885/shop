import { Suspense, type ReactNode } from "react"
import { QueryErrorResetBoundary } from "@tanstack/react-query"
import { ErrorBoundary } from "react-error-boundary"

import { toApiError } from "@shop/common/contract"
import { type AppLocale } from "@shop/i18n"
import { StateError } from "@shop/ui-web"

import { errorText } from "../i18n/error-keys"
import { useI18n } from "../i18n/use-i18n"

/** 区块级「挂起+失败」边界：官方三件套（QueryErrorResetBoundary + ErrorBoundary + 可选 Suspense）的组合收口，何时用/不用与 reset 语义见 docs/conventions/frontend.md「错误与重试」 */
interface QueryBoundaryProps {
    children: ReactNode
    /** fallback 传字符串 = 默认 StateError，必须是 `t("…")` 取的目录句子（硬编码中文会漏进英文界面）；传函数 = 自定义布局 */
    fallback: string | ((args: { error: unknown; reset: () => void }) => ReactNode)
    /** 仅当子树是 suspense 查询时传入；不传则不套 Suspense */
    pending?: ReactNode
}

/** 定义在模块作用域：渲染期就地写这段 JSX 会被 react/no-unstable-nested-components 判成每次渲染新建组件 */
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
