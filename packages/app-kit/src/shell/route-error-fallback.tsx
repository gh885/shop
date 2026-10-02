import type { ReactNode } from "react"
import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"

import { Button } from "@shop/ui-web"
import { isApiError, toApiError } from "@shop/common/contract"
import { errorText } from "../i18n/error-keys"
import { useI18n, useT } from "../i18n/use-i18n"

/**
 * 路由级错误边界的 fallback —— 实现 TanStack Router 的 `errorComponent` 契约
 * （`{ error, reset }`），三端共用，端级差异只有一个「次要出口」链接（由调用方传入）。
 *
 * 两个 reset 都要调，缺一不可：
 * - `reset`（Router 给的）：重置 CatchBoundary 的错误状态，让该 route 重新渲染；
 * - `resetQueryErrors`（`useQueryErrorResetBoundary`）：清 Query 的「错误已上报」标记。
 *   只调前者时，suspense / `throwOnError` 查询的 `retryOnMount` 被官方强制为 false，
 *   重挂载不会重新取数、错误立刻再抛 —— 重试按钮形同虚设。这是官方 Suspense 指南
 *   「Resetting Error Boundaries」一节存在的理由，也是本组件唯一必要的接线。
 *
 * 布局刻意保持「块级中性」：它按 `defaultErrorComponent` 挂在**每一个** route match 上，
 * 叶子路由失败时渲染在父级布局（侧边栏/导航壳）内部，不能假设自己占满整屏。
 */
interface RouteErrorFallbackProps {
    error: unknown
    /** Router 注入的边界重置 */
    reset: () => void
    /** 次要出口（回首页 / 回工作台…）；由各端传入，不传则只显示重试 */
    secondaryAction?: ReactNode
}

export function RouteErrorFallback({ error, reset, secondaryAction }: RouteErrorFallbackProps) {
    const { reset: resetQueryErrors } = useQueryErrorResetBoundary()
    const { locale } = useI18n()
    const t = useT()
    const message = isApiError(error)
        ? errorText(toApiError(error), locale)
        : t("appKit.routeError.description")

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-6 py-16">
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                <CircleAlert className="size-6 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">{t("appKit.routeError.label")}</p>
            <h1 className="text-xl font-bold">{t("appKit.routeError.title")}</h1>
            <p className="text-muted-foreground">{message}</p>
            <div className="mt-2 flex gap-2">
                <Button
                    onClick={() => {
                        resetQueryErrors()
                        reset()
                    }}
                >
                    {t("appKit.routeError.retry")}
                </Button>
                {secondaryAction}
            </div>
        </div>
    )
}
