import type { ReactNode } from "react"
import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"

import { Button } from "@shop/ui-web"
import { isApiError, toApiError } from "@shop/common/contract"
import { errorText } from "../i18n/error-keys"
import { useI18n, useT } from "../i18n/use-i18n"

/**
 * 路由级错误边界 fallback（TanStack Router errorComponent 契约，三端共用）。
 * 重试要两个 reset 一起调：只调 Router 的 `reset` 而漏 `resetQueryErrors`，throwOnError 查询的 retryOnMount 被官方强制 false → 重挂载不重新取数、错误再抛，重试按钮形同虚设。
 * 布局块级中性：挂在每个 route match 上，叶子失败时渲染在父级壳内，不假设占满整屏。
 */
interface RouteErrorFallbackProps {
    error: unknown
    reset: () => void
    secondaryAction?: ReactNode
}

export function RouteErrorFallback({ error, reset, secondaryAction }: RouteErrorFallbackProps) {
    const { reset: resetQueryErrors } = useQueryErrorResetBoundary()
    const { locale } = useI18n()
    const t = useT()
    const message = isApiError(error)
        ? errorText(toApiError(error), locale)
        : t("routeError.description")

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-6 py-16">
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                <CircleAlert className="size-6 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">{t("routeError.label")}</p>
            <h1 className="text-xl font-bold">{t("routeError.title")}</h1>
            <p className="text-muted-foreground">{message}</p>
            <div className="mt-2 flex gap-2">
                <Button
                    onClick={() => {
                        resetQueryErrors()
                        reset()
                    }}
                >
                    {t("routeError.retry")}
                </Button>
                {secondaryAction}
            </div>
        </div>
    )
}
